// リメイク解説（日本語 long/short）のルールベース検品。
//   - 文字数: long 60〜80字 / short 25〜50字（手作り1,061座の実測分布に合わせた枠）
//   - 丸写し検出: ソース（ヤマケイ/YAMAP/Wikipedia）と 25字以上の連続一致があれば NG
//   - 事実の楔: 標高数値が辞書と食い違っていれば NG（本文に数値がある場合のみ）
//
// 使い方: node scripts/check-remake.mjs <生成jsonl>
//   生成jsonl: 1行= {id, description_ja_long, description_ja_short, ...}
//   data-work/remake-sources.jsonl と突き合わせ、NG行を報告。全部OKなら exit 0。

import fs from "node:fs";

const LONG_MIN = 60, LONG_MAX = 80;
const SHORT_MIN = 25, SHORT_MAX = 50;
// 英語（手作り1,061座の実測分布: long 145〜267 / short 48〜156）。en フィールドがある行のみ検査
const EN_LONG_MIN = 140, EN_LONG_MAX = 270;
const EN_SHORT_MIN = 45, EN_SHORT_MAX = 160;
const COPY_NGRAM = 25;

const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/check-remake.mjs <generated.jsonl>");
  process.exit(1);
}
const jl = (p) => fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map(JSON.parse);
const sources = new Map(jl("data-work/remake-sources.jsonl").map((r) => [r.id, r]));

// text 中に corpus と COPY_NGRAM 字以上の連続一致があるか（コーパス側の n-gram を索引）
function longestCopy(text, corpus) {
  if (!text || !corpus) return 0;
  const grams = new Set();
  for (let i = 0; i + COPY_NGRAM <= corpus.length; i++) grams.add(corpus.slice(i, i + COPY_NGRAM));
  for (let i = 0; i + COPY_NGRAM <= text.length; i++) if (grams.has(text.slice(i, i + COPY_NGRAM))) return COPY_NGRAM;
  return 0;
}

let ok = 0;
const bad = [];
for (const r of jl(src)) {
  const s = sources.get(r.id);
  const errs = [];
  const L = r.description_ja_long ?? "";
  const S = r.description_ja_short ?? "";
  if (L.length < LONG_MIN || L.length > LONG_MAX) errs.push(`long ${L.length}字 (${LONG_MIN}〜${LONG_MAX})`);
  if (S.length < SHORT_MIN || S.length > SHORT_MAX) errs.push(`short ${S.length}字 (${SHORT_MIN}〜${SHORT_MAX})`);
  const EL = r.description_en_long, ES = r.description_en_short;
  if (EL != null && (EL.length < EN_LONG_MIN || EL.length > EN_LONG_MAX)) errs.push(`en_long ${EL.length}字 (${EN_LONG_MIN}〜${EN_LONG_MAX})`);
  if (ES != null && (ES.length < EN_SHORT_MIN || ES.length > EN_SHORT_MAX)) errs.push(`en_short ${ES.length}字 (${EN_SHORT_MIN}〜${EN_SHORT_MAX})`);
  if ((EL != null || ES != null) && !r.title_en) errs.push("title_en がない");
  if (s) {
    const corpus = [s.yamakei?.description, s.yamap?.description, s.wikipedia?.extract].filter(Boolean).join("\n");
    for (const [label, t] of [["long", L], ["short", S]]) {
      if (longestCopy(t, corpus)) errs.push(`${label} にソースと${COPY_NGRAM}字以上の連続一致`);
    }
    // 標高数値チェック: 本文中の「数字m」が辞書標高と±1m超ずれていたら NG（カンマ区切りも許容）
    for (const [label, t] of [["long", L], ["short", S], ["en_long", EL ?? ""], ["en_short", ES ?? ""]]) {
      for (const m of t.matchAll(/([\d,，]+)\s*m/g)) {
        const v = Number(m[1].replace(/[,，]/g, ""));
        if (v > 100 && Math.abs(v - s.elevation) > 1 && String(v).length >= String(s.elevation).length)
          errs.push(`${label} の標高 ${v}m が辞書 ${s.elevation}m と不一致の疑い`);
      }
    }
  } else {
    errs.push("remake-sources に id がない");
  }
  if (errs.length) bad.push({ id: r.id, name: r.title_ja ?? s?.name, errs });
  else ok++;
}
console.log(`OK ${ok} / NG ${bad.length}`);
for (const b of bad) console.log(`  id=${b.id} ${b.name ?? ""}: ${b.errs.join(" / ")}`);
process.exit(bad.length ? 1 : 0);
