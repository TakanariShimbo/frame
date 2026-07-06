// ヤマケイオンライン「山ナビ」(yamanavi/yama.php?yama_id=N) の解説文をローカルに保存する。
// 目的: リメイク解説を書く際の参照資料（そのまま転載はしない。事実確認用）。
//
// 使い方:
//   node scripts/fetch-yamakei.mjs <出力ディレクトリ> [--from 1] [--to 1040]
//   出力: <dir>/yamakei_yamanavi.jsonl（1行= {id, name, kana, elevation, area, pref, lat, lon, description, revised, url} または {id, miss:true}）
//
// 再開可能: 出力ファイルに既にある id はスキップして追記する。
// 控えめアクセス: 直列 + 300ms スリープ（全体で ~3req/s 未満）。

import fs from "node:fs";
import { join } from "node:path";

const BASE = "https://www.yamakei-online.com/yamanavi/yama.php?yama_id=";
const UA = "FrameBot/0.1 (https://github.com/TakanariShimbo/frame; mountain descriptions)";
const SLEEP_MS = 300;

const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: node scripts/fetch-yamakei.mjs <outdir> [--from N] [--to N]");
  process.exit(1);
}
const argN = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
};
const FROM = argN("--from", 1);
const TO = argN("--to", 1040);

fs.mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "yamakei_yamanavi.jsonl");

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
    } catch {
      /* リトライ */
    }
    await sleep(1000 * (attempt + 1));
  }
  return { status: 0 };
}

const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ");

function parse(id, html) {
  const rec = { id, url: BASE + id };

  // JSON-LD から名前・座標・標高・県などの構造化情報を取る
  const ld = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  if (ld) {
    try {
      const g = JSON.parse(ld[1])["@graph"];
      const art = g?.find((x) => x["@type"] === "Article");
      const about = art?.about;
      const m = /^(.+?)\s*\((.+?)\)\s*$/.exec(art?.name ?? "");
      rec.name = m ? m[1] : (art?.name ?? null);
      rec.kana = m ? m[2] : null;
      rec.lat = about?.geo?.latitude ?? null;
      rec.lon = about?.geo?.longitude ?? null;
      rec.elevation = about?.elevation ? Number(String(about.elevation).replace(/m$/, "")) : null;
      rec.pref = about?.address?.addressRegion ?? null;
      // keywords: "知床岳,1254m,北海道,北海道,知床半島" の末尾が山域
      const kw = (art?.keywords ?? "").split(",");
      rec.area = kw.length >= 5 ? kw[kw.length - 1] : null;
    } catch {
      /* JSON-LD 解析失敗は本文だけで続行 */
    }
  }

  // 本文解説: <p class="yamanavi-description__txt"> 〜 改定表記の <p class="yamanavi-description__end">
  const body = html.match(/<p class="yamanavi-description__txt">([\s\S]*?)<\/div>/);
  if (body) {
    let t = body[1];
    const end = t.match(/<p class="yamanavi-description__end">([\s\S]*?)<\/p>/);
    rec.revised = end ? decode(end[1].replace(/<[^>]+>/g, "").trim()) : null;
    if (end) t = t.replace(end[0], "");
    rec.description = decode(
      t
        .replace(/<br\s*\/?>/g, "\n")
        .replace(/<[^>]+>/g, "")
        .split("\n")
        .map((l) => l.replace(/^[\s　]+|\s+$/g, ""))
        .filter(Boolean)
        .join("\n"),
    );
  }
  return rec.description ? rec : null;
}

let ok = 0,
  miss = 0,
  skip = 0;
for (let id = FROM; id <= TO; id++) {
  if (done.has(id)) {
    skip++;
    continue;
  }
  const { status, html } = await fetchPage(id);
  let rec;
  if (status === 200) {
    rec = parse(id, html) ?? { id, miss: true, reason: "no-description" };
  } else if (status === 404) {
    rec = { id, miss: true };
  } else {
    console.error(`id=${id}: 取得失敗（リトライ上限）。中断します。再実行で再開できます。`);
    break;
  }
  fs.appendFileSync(outPath, JSON.stringify(rec) + "\n");
  rec.miss ? miss++ : ok++;
  if ((ok + miss) % 50 === 0) console.log(`進捗: ${id}/${TO} (取得 ${ok} / 欠番 ${miss} / スキップ ${skip})`);
  await sleep(SLEEP_MS);
}
console.log(`完了: 取得 ${ok} / 欠番 ${miss} / スキップ ${skip} -> ${outPath}`);
