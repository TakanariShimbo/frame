// 辞書の読み修正: data-work/dict-kana-suspect.json（読みのWeb検証結果）のうち
// confidence=high の項目を public/data/mountains.json の name_kana に反映する。
//   経緯: 解説リメイクの英訳時に辞書かなと通用読みの食い違いが148座見つかり、
//   Web検証（Wikipedia・ヤマケイ・自治体サイト等）で読みを確定した。low は保留。
// 使い方: node scripts/apply-kana-fixes.mjs [--write]（無指定はドライラン）

import { readFileSync, writeFileSync } from "node:fs";

const doWrite = process.argv.includes("--write");
const PATH = "public/data/mountains.json";
const all = JSON.parse(readFileSync(PATH, "utf8"));
const byId = new Map(all.map((m) => [m.id, m]));

const suspects = JSON.parse(readFileSync("data-work/dict-kana-suspect.json", "utf8"));
let applied = 0,
  skippedLow = 0,
  same = 0;
for (const s of suspects) {
  if (s.confidence !== "high") {
    skippedLow++;
    continue;
  }
  const m = byId.get(s.id);
  if (!m || !s.correct_kana) continue;
  if (m.name_kana === s.correct_kana) {
    same++;
    continue;
  }
  console.log(`${s.id} ${s.name}: ${m.name_kana} -> ${s.correct_kana} (${s.evidence})`);
  m.name_kana = s.correct_kana;
  applied++;
}
console.log(`適用 ${applied} / 一致済み ${same} / low保留 ${skippedLow}`);
if (doWrite) {
  writeFileSync(PATH, JSON.stringify(all));
  console.log(`書き込み: ${PATH}`);
} else {
  console.log("(dry-run: --write で書き込み)");
}
