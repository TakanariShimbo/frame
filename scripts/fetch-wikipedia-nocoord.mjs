// fetch-wikipedia.mjs の miss 分の救済パス。
// 富士山のように記事はあるが GeoData に座標登録がない山を拾う。
// 座標検証ができない代わりに、取り違え防止として次を全部要求する:
//   1) 正規化した記事タイトル == 山名（リダイレクト解決後）
//   2) 本文が山の記事らしい（isMountainText 相当）
//   3) 本文冒頭に標高の記載があり、辞書の標高と ±50m 以内
//
// 使い方: node scripts/fetch-wikipedia-nocoord.mjs <dir>
//   <dir>/wikipedia_extracts.jsonl の miss 行を再判定し、hit になったものを
//   <dir>/wikipedia_extracts_nocoord.jsonl に書き出す（元ファイルは変更しない）。

import fs from "node:fs";
import { join } from "node:path";

const API = "https://ja.wikipedia.org/w/api.php";
const UA = "FrameBot/0.1 (https://github.com/TakanariShimbo/frame; mountain descriptions)";
const SLEEP_MS = 100;
const CONCURRENCY = 4;
const ELEV_TOL = 50;

const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: node scripts/fetch-wikipedia-nocoord.mjs <dir>");
  process.exit(1);
}
const srcPath = join(outDir, "wikipedia_extracts.jsonl");
const outPath = join(outDir, "wikipedia_extracts_nocoord.jsonl");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const u = new URL(API);
  u.search = new URLSearchParams({ format: "json", formatversion: "2", ...params }).toString();
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": UA } });
      if (r.ok) return await r.json();
    } catch {
      /* リトライ */
    }
    await sleep(600 * (attempt + 1));
  }
  return null;
}

const stripParen = (s) => s.replace(/[（(].*?[)）]/g, "").trim();
const norm = (s) => (s ?? "").normalize("NFKC").replace(/ヶ/g, "ケ").replace(/剱/g, "剣").replace(/嶽/g, "岳").replace(/[\s・]/g, "");

const firstSentence = (ex) => {
  const t = (ex || "").replace(/\s+/g, " ").trim();
  const i = t.indexOf("。");
  return i < 0 ? t : t.slice(0, i + 1);
};
function isMountainText(ex) {
  const s = firstSentence(ex);
  if (!s) return false;
  if (/(以下|曖昧さ回避|を指す|に関する記事|の名称|の名前)/.test(s)) return false;
  if (/(駅|市|町|村|区|湖|沼|池|川|河川|温泉|神社|寺院?|城|公園|空港|鉄道|道路|トンネル|ダム|峠|学校|大学|株式会社)(である|です)?。?$/.test(s)) return false;
  return /(山|岳|峰|嶽|連峰|火山|標高|山頂|高原|山地)/.test(s);
}
// 本文冒頭から標高値（m）を拾う。「標高は3775.56 m」「標高1,254m」等
function extractElevation(ex) {
  const m = /標高[はが]?約?\s*([\d,，]+(?:\.\d+)?)\s*(?:m|ｍ|メートル)/.exec((ex || "").slice(0, 500));
  return m ? Number(m[1].replace(/[,，]/g, "")) : null;
}

// --- main ---
const all = JSON.parse(fs.readFileSync("public/data/mountains.json", "utf8"));
const byId = new Map(all.map((m) => [m.id, m]));
const missIds = [];
for (const line of fs.readFileSync(srcPath, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  if (r.miss && byId.has(r.id)) missIds.push(r.id);
}
const done = new Set();
if (fs.existsSync(outPath)) {
  for (const line of fs.readFileSync(outPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      done.add(JSON.parse(line).id);
    } catch {
      /* 壊れ行は無視 */
    }
  }
}
const targets = missIds.filter((id) => !done.has(id)).map((id) => byId.get(id));
console.error(`対象 miss: ${targets.length}（再開スキップ ${missIds.length - targets.length}）`);

const write = (obj) => fs.appendFileSync(outPath, JSON.stringify(obj) + "\n");
let hit = 0,
  processed = 0;

const chunks = [];
for (let i = 0; i < targets.length; i += 20) chunks.push(targets.slice(i, i + 20));

async function pool(items, fn) {
  let idx = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const i = idx++;
        if (i >= items.length) return;
        await fn(items[i]);
      }
    }),
  );
}

await pool(chunks, async (chunk) => {
  const titles = chunk.map((m) => stripParen(m.name));
  const j = await api({
    action: "query",
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    exlimit: "max",
    redirects: "1",
    titles: [...new Set(titles)].join("|"),
  });
  await sleep(SLEEP_MS);
  const alias = {};
  for (const n of j?.query?.normalized || []) alias[n.from] = n.to;
  for (const r of j?.query?.redirects || []) alias[r.from] = r.to;
  const resolve = (t) => {
    let x = t,
      seen = new Set();
    while (alias[x] && !seen.has(x)) {
      seen.add(x);
      x = alias[x];
    }
    return x;
  };
  const byTitle = {};
  for (const p of j?.query?.pages || []) byTitle[p.title] = p;
  for (const mt of chunk) {
    const p = byTitle[resolve(stripParen(mt.name))];
    processed++;
    if (!p || p.missing || !p.extract) continue;
    // タイトルは記事側の括弧書き（曖昧さ回避サフィックス）を除いて比較
    if (norm(stripParen(p.title)) !== norm(stripParen(mt.name))) continue;
    if (!isMountainText(p.extract)) continue;
    const elev = extractElevation(p.extract);
    if (elev == null || mt.elevation_m == null || Math.abs(elev - mt.elevation_m) > ELEV_TOL) continue;
    write({
      id: mt.id,
      title: p.title,
      extract: p.extract.replace(/\s+/g, " ").trim(),
      url: "https://ja.wikipedia.org/wiki/" + encodeURIComponent(p.title.replace(/ /g, "_")),
      via: "name-noloc",
      elevDiff: Math.round(Math.abs(elev - mt.elevation_m)),
    });
    hit++;
  }
  if (processed % 2000 < 20) console.error(`  ${processed}/${targets.length} hit=${hit}`);
});
console.error(`完了: hit=${hit}/${targets.length} -> ${outPath}`);
