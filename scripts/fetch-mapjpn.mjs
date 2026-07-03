// map.jpn.org（あにねこ氏「山名一覧 on the Web地図」）から山データを取得する。
// 使い方: node scripts/fetch-mapjpn.mjs <出力ディレクトリ>
//   1. 全山レイヤ GeoJSON（id/name/座標）を取得 → mapjpn_all.json
//   2. 各 id の詳細（読み・標高・住所・別名）を取得 → mapjpn_details.jsonl（追記・再開可能）
// 個人運営サーバーのため並列2・リクエスト間隔を空けて丁寧にクロールする。
// データの利用はあにねこ氏への許諾確認が前提（取得物の再配布はこのスクリプトの責任外）。

import { mkdirSync, existsSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://map.jpn.org/share/db.php";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://map.jpn.org/mountain.html",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Dest": "empty",
};
const CONCURRENCY = 2;
const DELAY_MS = 150; // 各ワーカーのリクエスト間隔（全体で ~10req/s を大きく下回る）

const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: node scripts/fetch-mapjpn.mjs <outdir>");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const allPath = join(outDir, "mapjpn_all.json");
const detailPath = join(outDir, "mapjpn_details.jsonl");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: HEADERS });
      if (r.ok) return await r.json();
      if (r.status === 403 || r.status === 429) await sleep(5000 * (i + 1));
      else await sleep(1000 * (i + 1));
    } catch {
      await sleep(2000 * (i + 1));
    }
  }
  return null;
}

// 1. 全山レイヤ（id 一覧の元）
let all;
if (existsSync(allPath)) {
  all = JSON.parse(readFileSync(allPath, "utf8"));
} else {
  all = await fetchJson(`${BASE}?cat=0&v=0`);
  if (!all?.features) {
    console.error("layer fetch failed");
    process.exit(1);
  }
  writeFileSync(allPath, JSON.stringify(all));
}
const ids = all.features.map((f) => f.id).sort((a, b) => a - b);
console.log(`layer: ${ids.length} mountains`);

// 2. 既取得分を読み飛ばして再開
const done = new Set();
if (existsSync(detailPath)) {
  for (const line of readFileSync(detailPath, "utf8").split("\n")) {
    if (!line) continue;
    try {
      done.add(JSON.parse(line).id);
    } catch {}
  }
}
const todo = ids.filter((id) => !done.has(id));
console.log(`done: ${done.size}, todo: ${todo.length}`);

let idx = 0;
let ok = 0;
let fail = 0;
async function worker() {
  for (;;) {
    const i = idx++;
    if (i >= todo.length) return;
    const id = todo[i];
    const d = await fetchJson(`${BASE}?id=${id}`);
    const rec = d?.geo?.[0];
    if (rec && rec.id === id) {
      appendFileSync(detailPath, JSON.stringify(rec) + "\n");
      ok++;
    } else {
      appendFileSync(detailPath, JSON.stringify({ id, _error: true }) + "\n");
      fail++;
    }
    if ((ok + fail) % 500 === 0) console.log(`progress: ${ok + fail}/${todo.length} (fail ${fail})`);
    await sleep(DELAY_MS);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`finished: ok=${ok} fail=${fail} total_done=${done.size + ok + fail}`);
