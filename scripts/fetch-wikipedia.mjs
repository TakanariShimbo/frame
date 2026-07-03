// 山DBの各山に Wikipedia(日本語) のイントロ抜粋（解説生成の事実ソース）を対応付ける。
// trace の fetch-descriptions.mjs を frame 用に移植: 対象は解説DB未収載の山（新規約26,000座）、
// 別名(aliases)も照合候補に使い、結果は JSONL に追記して中断・再開可能。
//   出典: Wikipedia 日本語版（テキストは CC BY-SA 4.0）。url を出典として保存する。
//
// 使い方:
//   node scripts/fetch-wikipedia.mjs <出力ディレクトリ> [--sample 100]
//   出力: <dir>/wikipedia_extracts.jsonl（1行= {id, title, extract, url, via} または {id, miss:true}）
//
// マッチング方針（同名の山を取り違えないため座標＋山らしさで照合）:
//   A) 名前（括弧除去）を一括バッチ取得し、記事座標が山頂座標の近く&「山らしい」記事なら採用
//   B) 未解決は 別名 と list=search の候補から、座標が最も近い山記事を採用
//   曖昧さ回避ページ・座標なし・遠すぎ・市/湖など非山記事は不採用（miss として記録）

import fs from "node:fs";
import { join } from "node:path";

const API = "https://ja.wikipedia.org/w/api.php";
const UA = "FrameBot/0.1 (https://github.com/TakanariShimbo/frame; mountain descriptions)";
const DEG_TOL = 0.2; // 山頂座標と記事座標の許容差（度）
const EXTRACT_MAX = 300;
const SLEEP_MS = 100; // リクエストは直列（Wikimedia API エチケット）。待機は控えめに


const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: node scripts/fetch-wikipedia.mjs <outdir> [--sample N]");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "wikipedia_extracts.jsonl");

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

const near = (a1, o1, a2, o2) => Math.abs(a1 - a2) <= DEG_TOL && Math.abs(o1 - o2) <= DEG_TOL;
const dist = (a1, o1, a2, o2) => Math.hypot(a1 - a2, o1 - o2);
const stripParen = (s) => s.replace(/[（(].*?[)）]/g, "").trim();

function trimExtract(s) {
  if (!s) return "";
  let t = s.replace(/\s+/g, " ").trim();
  if (t.length <= EXTRACT_MAX) return t;
  t = t.slice(0, EXTRACT_MAX);
  const last = t.lastIndexOf("。");
  return last > EXTRACT_MAX * 0.5 ? t.slice(0, last + 1) : t + "…";
}

const firstSentence = (ex) => { const t = (ex || "").replace(/\s+/g, " ").trim(); const i = t.indexOf("。"); return i < 0 ? t : t.slice(0, i + 1); };
function isMountainText(ex) {
  const s = firstSentence(ex);
  if (!s) return false;
  if (/(以下|曖昧さ回避|を指す|に関する記事|の名称|の名前)/.test(s)) return false;
  // 「〜の駅である。」「〜の湖です。」等の語尾も除外する
  if (/(駅|市|町|村|区|湖|沼|池|川|河川|温泉|神社|寺院?|城|公園|空港|鉄道|道路|トンネル|ダム|峠|学校|大学|株式会社)(である|です)?。?$/.test(s)) return false;
  return /(山|岳|峰|嶽|連峰|火山|標高|山頂|高原|山地)/.test(s);
}

// タイトル群をまとめて取得（extracts は exlimit 上限20なので20件ずつ）
async function fetchPages(titles) {
  const out = {};
  const uniq = [...new Set(titles)];
  for (let i = 0; i < uniq.length; i += 20) {
    const chunk = uniq.slice(i, i + 20);
    const j = await api({
      action: "query",
      prop: "extracts|coordinates",
      exintro: "1",
      explaintext: "1",
      exlimit: "max",
      colimit: "max",
      redirects: "1",
      titles: chunk.join("|"),
    });
    await sleep(SLEEP_MS);
    const alias = {};
    for (const n of j?.query?.normalized || []) alias[n.from] = n.to;
    for (const r of j?.query?.redirects || []) alias[r.from] = r.to;
    const resolve = (t) => { let x = t, seen = new Set(); while (alias[x] && !seen.has(x)) { seen.add(x); x = alias[x]; } return x; };
    const byTitle = {};
    for (const p of j?.query?.pages || []) byTitle[p.title] = p;
    for (const t of chunk) out[t] = byTitle[resolve(t)] || { missing: true };
  }
  return out;
}

async function searchCandidates(name) {
  const j = await api({ action: "query", list: "search", srsearch: name, srlimit: "10", srnamespace: "0" });
  await sleep(SLEEP_MS);
  return (j?.query?.search || []).map((s) => s.title);
}

function chooseMountain(mt, pages, requireCoord) {
  let best = null;
  let coordless = null;
  for (const p of Object.values(pages)) {
    if (!p || p.missing || !isMountainText(p.extract)) continue;
    const c = p.coordinates?.[0];
    if (c) {
      if (!near(mt.latitude, mt.longitude, c.lat, c.lon)) continue;
      const d = dist(mt.latitude, mt.longitude, c.lat, c.lon);
      if (!best || d < best.d) best = { page: p, d };
    } else if (!requireCoord && !coordless) {
      coordless = { page: p, d: 9 };
    }
  }
  return best || coordless;
}

function mkResult(mt, best, via) {
  const p = best.page;
  const extract = trimExtract(p.extract);
  if (!extract || extract.length < 20) return null;
  return {
    id: mt.id,
    title: p.title,
    extract,
    url: "https://ja.wikipedia.org/wiki/" + encodeURIComponent(p.title.replace(/ /g, "_")),
    via,
    distDeg: Number(best.d.toFixed(4)),
  };
}

// --- main ---
const all = JSON.parse(fs.readFileSync("public/data/mountains.json", "utf8"));
const descs = JSON.parse(fs.readFileSync("public/data/mountain_descriptions.json", "utf8"));
const hasDesc = new Set(Object.keys(descs.descriptions ?? {}).map(Number));

// 既取得分を読み飛ばして再開
const done = new Set();
if (fs.existsSync(outPath)) {
  for (const line of fs.readFileSync(outPath, "utf8").split("\n")) {
    if (!line) continue;
    try { done.add(JSON.parse(line).id); } catch {}
  }
}

let targets = all.filter((m) => !hasDesc.has(m.id) && !done.has(m.id));
const sampleIdx = process.argv.indexOf("--sample");
if (sampleIdx >= 0) {
  const n = Number(process.argv[sampleIdx + 1]) || 100;
  const step = Math.max(1, Math.floor(targets.length / n));
  targets = targets.filter((_, i) => i % step === 0).slice(0, n);
}
console.error(`対象: ${targets.length}（解説あり ${hasDesc.size}・取得済み ${done.size} を除外）`);

const write = (obj) => fs.appendFileSync(outPath, JSON.stringify(obj) + "\n");
let hit = 0, miss = 0;

// Phase A: 名前一括取得（20件ずつ随時判定・保存）
console.error("Phase A: 名前一括取得…");
const unresolved = [];
for (let i = 0; i < targets.length; i += 20) {
  const chunk = targets.slice(i, i + 20);
  const pages = await fetchPages(chunk.map((m) => stripParen(m.name)));
  for (const mt of chunk) {
    const p = pages[stripParen(mt.name)];
    // 対象がマイナー峰中心のため座標一致を必須にする（座標なし記事は曖昧さ回避の誤採用が多い）
    const best = p && !p.missing ? chooseMountain(mt, { p }, true) : null;
    const r = best ? mkResult(mt, best, "name") : null;
    if (r) { write(r); hit++; } else unresolved.push(mt);
  }
  if ((i / 20) % 50 === 0) console.error(`  A: ${Math.min(i + 20, targets.length)}/${targets.length} hit=${hit}`);
}
console.error(`Phase A 完了: hit=${hit} 未解決=${unresolved.length}`);

// Phase B: 別名＋検索フォールバック（未解決のみ、個別に）
console.error("Phase B: 別名/検索フォールバック…");
for (let i = 0; i < unresolved.length; i++) {
  const mt = unresolved[i];
  const cand = (mt.aliases ?? []).map((a) => a.name);
  cand.push(...(await searchCandidates(stripParen(mt.name))));
  const pages = cand.length ? await fetchPages(cand) : {};
  const best = chooseMountain(mt, pages, true);
  const r = best ? mkResult(mt, best, "search") : null;
  if (r) { write(r); hit++; } else { write({ id: mt.id, miss: true }); miss++; }
  if ((i + 1) % 100 === 0 || i === unresolved.length - 1)
    console.error(`  B: ${i + 1}/${unresolved.length} hit=${hit} miss=${miss}`);
}
console.error(`完了: hit=${hit} miss=${miss} (${((hit / (hit + miss || 1)) * 100).toFixed(0)}%)`);
