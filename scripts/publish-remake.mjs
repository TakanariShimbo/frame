// リメイク解説（data-work/remake-descriptions.jsonl、ヤマケイ網羅975座）を解説DBとして公開する。
// 旧DB（手作り1,061座＋AI生成26,336座）は全て置き換える（クリーン化）。
// 使い方: node scripts/publish-remake.mjs [--write]（--write なしはドライラン）
//
// シャード方式は merge-descriptions.mjs と同じ: shard-{floor(id/500)}.json。
// 解説のない山はシャード自体が無いか空 → クライアントは解説なしとして扱う（既存挙動）。

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";

const SHARD_SIZE = 500; // src/lib/mountains.ts と揃えること
const doWrite = process.argv.includes("--write");

const descs = {};
for (const line of readFileSync("data-work/remake-descriptions.jsonl", "utf8").split("\n")) {
  if (!line.trim()) continue;
  const e = JSON.parse(line);
  descs[String(e.id)] = {
    title_ja: e.title_ja,
    title_en: e.title_en || undefined,
    description_ja_long: e.description_ja_long,
    description_ja_short: e.description_ja_short,
    description_en_long: e.description_en_long || undefined,
    description_en_short: e.description_en_short || undefined,
    tags_ja: e.tags_ja?.length ? e.tags_ja : undefined,
    tags_en: e.tags_en?.length ? e.tags_en : undefined,
    quality: "remake",
  };
}

const meta = {
  note: "山解説リメイク版。ヤマケイ山ナビ・YAMAP・Wikipediaの事実情報をもとにAIが独自に執筆（転載なし・機械検品済み）。",
  license: "生成文はオリジナル（事実は著作権対象外）",
  count: Object.keys(descs).length,
  shard_size: SHARD_SIZE,
};
console.log(`公開対象: ${meta.count} 座（旧DBは全て置き換え）`);

if (!doWrite) {
  console.log("(dry-run: --write で書き込み)");
  process.exit(0);
}

writeFileSync("data-work/mountain_descriptions_full.json", JSON.stringify({ _meta: meta, descriptions: descs }));

const dir = "public/data/descriptions";
if (existsSync(dir)) rmSync(dir, { recursive: true });
mkdirSync(dir, { recursive: true });
const shards = new Map();
for (const [k, v] of Object.entries(descs)) {
  const s = Math.floor(Number(k) / SHARD_SIZE);
  if (!shards.has(s)) shards.set(s, {});
  shards.get(s)[k] = v;
}
let totalBytes = 0;
for (const [s, obj] of shards) {
  const json = JSON.stringify(obj);
  totalBytes += json.length;
  writeFileSync(`${dir}/shard-${s}.json`, json);
}
writeFileSync(`${dir}/index.json`, JSON.stringify({ _meta: meta, shards: [...shards.keys()].sort((a, b) => a - b) }));

// 旧一括ファイルはメタのみに縮退（後方互換）
writeFileSync(
  "public/data/mountain_descriptions.json",
  JSON.stringify({ _meta: { ...meta, moved_to: "data/descriptions/shard-{n}.json" }, descriptions: {} }),
);

console.log(`シャード: ${shards.size}個 (${(totalBytes / 1e3).toFixed(0)} KB) -> ${dir}/`);
