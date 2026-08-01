// フィーチャーエントリ（public/data/featured.json）のルールベース検品。
// 文字数の枠は山の解説（scripts/check-remake.mjs）と同じ:
//   - 日本語: long 60〜80字 / short 25〜50字
//   - 英語:   long 140〜270字 / short 45〜160字
// 加えて、必須フィールド・id範囲（9,000,000以上）・id重複・座標・単位数値をチェックする。
//
// 使い方: node scripts/check-featured.mjs   （NGがあれば一覧を出して exit 1）

import fs from "node:fs";

const LONG_MIN = 60, LONG_MAX = 80;
const SHORT_MIN = 25, SHORT_MAX = 50;
const EN_LONG_MIN = 140, EN_LONG_MAX = 270;
const EN_SHORT_MIN = 45, EN_SHORT_MAX = 160;
const FEATURED_ID_BASE = 9_000_000;

const entries = JSON.parse(fs.readFileSync("public/data/featured.json", "utf8"));
if (!Array.isArray(entries)) {
  console.error("featured.json が配列ではありません");
  process.exit(1);
}

let ok = 0;
const bad = [];
const seenIds = new Set();
for (const e of entries) {
  const errs = [];
  if (typeof e.id !== "number" || e.id < FEATURED_ID_BASE) errs.push(`id ${e.id} が ${FEATURED_ID_BASE} 未満`);
  if (seenIds.has(e.id)) errs.push(`id ${e.id} が重複`);
  seenIds.add(e.id);
  if (!e.name) errs.push("name がない");
  if (typeof e.elevation_m !== "number") errs.push("elevation_m が数値でない");
  if (typeof e.latitude !== "number" || typeof e.longitude !== "number") errs.push("座標がない");
  if (typeof e.priority !== "number") errs.push("priority がない");
  const d = e.description;
  if (!d) errs.push("description がない");
  else {
    const L = d.description_ja_long ?? "";
    const S = d.description_ja_short ?? "";
    if (!d.title_ja) errs.push("title_ja がない");
    if (L.length < LONG_MIN || L.length > LONG_MAX) errs.push(`ja_long ${L.length}字 (${LONG_MIN}〜${LONG_MAX})`);
    if (S.length < SHORT_MIN || S.length > SHORT_MAX) errs.push(`ja_short ${S.length}字 (${SHORT_MIN}〜${SHORT_MAX})`);
    const EL = d.description_en_long, ES = d.description_en_short;
    if (EL != null && (EL.length < EN_LONG_MIN || EL.length > EN_LONG_MAX)) errs.push(`en_long ${EL.length}字 (${EN_LONG_MIN}〜${EN_LONG_MAX})`);
    if (ES != null && (ES.length < EN_SHORT_MIN || ES.length > EN_SHORT_MAX)) errs.push(`en_short ${ES.length}字 (${EN_SHORT_MIN}〜${EN_SHORT_MAX})`);
    if ((EL != null || ES != null) && !d.title_en) errs.push("title_en がない");
  }
  if (errs.length) bad.push({ id: e.id, name: e.name, errs });
  else ok++;
}

for (const b of bad) console.log(`NG id=${b.id} ${b.name}: ${b.errs.join(" / ")}`);
console.log(`OK ${ok} / NG ${bad.length} / 全${entries.length}件`);
process.exit(bad.length ? 1 : 0);
