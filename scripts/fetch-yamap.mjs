// YAMAP (yamap.com/mountains/N) の山ページから解説文と基本情報をローカルに保存する。
// 目的: リメイク解説を書く際の参照資料（そのまま転載はしない。事実確認用）。
// ページは Next.js 製で、__NEXT_DATA__ の JSON に山情報が全部入っているのでそれを抽出する。
//
// 使い方:
//   node scripts/fetch-yamap.mjs <出力ディレクトリ> [--from 1] [--to 20400]
//   出力: <dir>/yamap_mountains.jsonl
//     1行= {id, name, kana, elevation, lat, lon, prefectures, description, shortDescription,
//           aiGeneratedDescription, attentionInfo, tags, wikipediaUrl, url} または {id, miss:true}
//
// 再開可能: 出力ファイルに既にある id はスキップして追記する。
// アクセス: fetch-wikipedia.mjs と同じくワーカー4本・各直列＋スリープ（全体 ~5req/s 未満）。

import fs from "node:fs";
import { join } from "node:path";

const BASE = "https://yamap.com/mountains/";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const SLEEP_MS = 300;
const CONCURRENCY = 4;

const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: node scripts/fetch-yamap.mjs <outdir> [--from N] [--to N]");
  process.exit(1);
}
const argN = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
};
const FROM = argN("--from", 1);
const TO = argN("--to", 20400);

fs.mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "yamap_mountains.jsonl");

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(id) {
  const url = BASE + id;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (r.status === 404) return { status: 404 };
      if (r.ok) return { status: 200, html: await r.text() };
      if (r.status === 429) await sleep(5000); // レート制限は長めに待つ
    } catch {
      /* リトライ */
    }
    await sleep(1000 * (attempt + 1));
  }
  return { status: 0 };
}

function parse(id, html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
  if (!m) return null;
  let mt;
  try {
    mt = JSON.parse(m[1]).props?.pageProps?.mountain;
  } catch {
    return null;
  }
  if (!mt) return null;
  return {
    id,
    name: mt.name ?? null,
    kana: mt.nameHira ?? null,
    elevation: mt.altitude ?? null,
    // coord は [lon, lat] の GeoJSON 順
    lat: Array.isArray(mt.coord) ? mt.coord[1] : null,
    lon: Array.isArray(mt.coord) ? mt.coord[0] : null,
    prefectures: (mt.prefectures ?? []).map((p) => p.fullName ?? p.name).filter(Boolean),
    description: mt.description || null,
    shortDescription: mt.shortDescription || null,
    aiGeneratedDescription: mt.aiGeneratedDescription || null,
    attentionInfo: mt.attentionInfo || null,
    tags: (mt.tags ?? []).map((t) => t.name ?? t).filter(Boolean),
    wikipediaUrl: mt.wikipediaUrl || null,
    url: BASE + id,
  };
}

const ids = [];
for (let id = FROM; id <= TO; id++) if (!done.has(id)) ids.push(id);
console.log(`対象 ${ids.length} 件（スキップ ${TO - FROM + 1 - ids.length}）`);

let ok = 0,
  miss = 0,
  fail = 0,
  processed = 0;
let aborted = false;

async function pool(items, fn) {
  let idx = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        if (aborted) return;
        const i = idx++;
        if (i >= items.length) return;
        await fn(items[i]);
      }
    }),
  );
}

await pool(ids, async (id) => {
  const { status, html } = await fetchPage(id);
  let rec;
  if (status === 200) {
    rec = parse(id, html) ?? { id, miss: true, reason: "no-next-data" };
  } else if (status === 404) {
    rec = { id, miss: true };
  } else {
    fail++;
    if (fail > 20) {
      if (!aborted) console.error("取得失敗が続くため中断します。再実行で再開できます。");
      aborted = true;
    }
    return;
  }
  fs.appendFileSync(outPath, JSON.stringify(rec) + "\n");
  rec.miss ? miss++ : ok++;
  if (++processed % 200 === 0) console.log(`進捗: ${processed}/${ids.length} (取得 ${ok} / 欠番 ${miss} / 失敗 ${fail})`);
  await sleep(SLEEP_MS);
});
console.log(`完了: 取得 ${ok} / 欠番 ${miss} / 失敗 ${fail} -> ${outPath}`);
