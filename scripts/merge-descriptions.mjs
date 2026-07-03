// 生成した山解説（all-entries.jsonl）を mountain_descriptions.json にマージし、
// あわせてシャード分割版（public/data/descriptions/shard-*.json）を出力する。
// 使い方: node scripts/merge-descriptions.mjs <all-entries.jsonl> [--write]
//   --write なしはドライラン（統計のみ）。
//
// シャード方式: id を SHARD_SIZE で割った商がシャード番号（例 id=103611 → shard-207）。
// クライアントは選んだ山の id から必要シャードだけ fetch する。
// 既存の mountain_descriptions.json（1,061座・手作り品質）は上書きしない。

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";

const SHARD_SIZE = 500;
const src = process.argv[2];
const doWrite = process.argv.includes("--write");
if (!src) {
  console.error("usage: node scripts/merge-descriptions.mjs <all-entries.jsonl> [--write]");
  process.exit(1);
}

const DESC_PATH = "public/data/mountain_descriptions.json";
const base = JSON.parse(readFileSync(DESC_PATH, "utf8"));
const descs = base.descriptions ?? {};
const existing = new Set(Object.keys(descs));

let added = 0, skipped = 0, good = 0;
for (const line of readFileSync(src, "utf8").split("\n")) {
  if (!line) continue;
  const e = JSON.parse(line);
  const key = String(e.id);
  if (existing.has(key)) { skipped++; continue; } // 既存（手作り1,061座）優先
  const d = {
    title_ja: e.title_ja,
    title_en: e.title_en || undefined,
    description_ja_long: e.description_ja_long,
    description_ja_short: e.description_ja_short || undefined,
    description_en_long: e.description_en_long || undefined,
    description_en_short: e.description_en_short || undefined,
    tags_ja: e.tags_ja?.length ? e.tags_ja : undefined,
    tags_en: e.tags_en?.length ? e.tags_en : undefined,
    quality: e.quality,
    url: e.url || undefined,
  };
  descs[key] = d;
  added++;
  if (e.quality === "good") good++;
}

const meta = {
  ...base._meta,
  note: "山解説。既存分は事実情報をもとにAI生成。追加分はweb調査（出典URL付き=good）または与えられた事実のみ（generic）からAI生成。",
  license: "生成文はオリジナル（事実は著作権対象外）。出典は url を明記",
  count: Object.keys(descs).length,
  merged: new Date().toISOString(),
  shard_size: SHARD_SIZE,
};

console.log(`既存: ${existing.size}  追加: ${added} (good ${good})  スキップ(既存優先): ${skipped}  合計: ${Object.keys(descs).length}`);

if (!doWrite) {
  console.log("(dry-run: --write で書き込み)");
  process.exit(0);
}

// 1. 全量版（ビルド外の保全用に data-work/ へ。アプリはシャードを読む）
mkdirSync("data-work", { recursive: true });
writeFileSync("data-work/mountain_descriptions_full.json", JSON.stringify({ _meta: meta, descriptions: descs }));

// 2. シャード分割（public/data/descriptions/）
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
// 3. シャード目録（メタ情報。クライアントは shard_size から番号を計算するので一覧は不要だが検証用に）
writeFileSync(`${dir}/index.json`, JSON.stringify({ _meta: meta, shards: [...shards.keys()].sort((a, b) => a - b) }));

// 4. 旧一括ファイルはメタのみに縮退（後方互換: 旧クライアントが読んでも壊れないよう空の descriptions を返す）
writeFileSync(DESC_PATH, JSON.stringify({ _meta: { ...meta, moved_to: "data/descriptions/shard-{n}.json" }, descriptions: {} }));

console.log(`シャード: ${shards.size}個 (${(totalBytes / 1e6).toFixed(1)} MB) -> ${dir}/`);
console.log(`全量版: data-work/mountain_descriptions_full.json`);
