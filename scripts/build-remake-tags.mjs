// リメイク解説 975座にタグを付与する（生成でなくソースからのルールベース転記）。
//   - YAMAP の tags（日本百名山などの統制語彙36語）をそのまま tags_ja に採用
//   - 英語 tags_en は下の対訳表で機械変換（未知語はスキップして警告）
//   - 3000m峰 は辞書標高からも補完（YAMAP タグ欠落対策）
//
// 使い方: node scripts/build-remake-tags.mjs
//   data-work/remake-descriptions.jsonl を読み、tags_ja / tags_en を付けて上書き保存。

import fs from "node:fs";

const EN = {
  日本百名山: "100 Famous Japanese Mountains",
  日本二百名山: "200 Famous Japanese Mountains",
  日本三百名山: "300 Famous Japanese Mountains",
  日本百高山: "100 Highest Mountains of Japan",
  日本百低山: "100 Famous Low Mountains of Japan",
  花の百名山: "100 Famous Flower Mountains",
  都道府県最高峰: "Prefectural High Point",
  "3000m峰": "3000m Peak",
  初心者向けの山: "Beginner-Friendly Mountain",
  しま山100選: "100 Island Mountains",
  北海道百名山: "100 Famous Mountains of Hokkaido",
  東北百名山: "100 Famous Mountains of Tohoku",
  やまがた百名山: "100 Famous Mountains of Yamagata",
  ぐんま百名山: "100 Famous Mountains of Gunma",
  関東百名山: "100 Famous Mountains of Kanto",
  埼玉県の山50: "50 Mountains of Saitama",
  多摩百山: "100 Mountains of Tama",
  藤野15名山: "15 Famous Mountains of Fujino",
  山梨百名山: "100 Famous Mountains of Yamanashi",
  信州百名山: "100 Famous Mountains of Shinshu",
  新潟100名山: "100 Famous Mountains of Niigata",
  静岡の百山: "100 Mountains of Shizuoka",
  愛知の130山: "130 Mountains of Aichi",
  ぎふ百山: "100 Mountains of Gifu",
  関西百名山: "100 Famous Mountains of Kansai",
  奈良百遊山: "100 Mountains of Nara",
  大阪50山: "50 Mountains of Osaka",
  ふるさと兵庫100山: "100 Mountains of Hyogo",
  宍粟50名山: "50 Famous Mountains of Shiso",
  中国百名山: "100 Famous Mountains of Chugoku",
  四国百名山: "100 Famous Mountains of Shikoku",
  九州百名山: "100 Famous Mountains of Kyushu",
  くじゅう17サミッツ: "Kuju 17 Summits",
  大分百山: "100 Mountains of Oita",
  みやざき百山: "100 Mountains of Miyazaki",
  札幌50峰: "50 Peaks of Sapporo",
};

const jl = (p) => fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map(JSON.parse);
const app = new Map(JSON.parse(fs.readFileSync("public/data/mountains.json", "utf8")).map((m) => [m.id, m]));
const yp = new Map(jl("data-work/yamap_mountains.jsonl").filter((r) => !r.miss).map((r) => [r.id, r]));

// coverage CSV からアプリ山ID -> yamap_id
const ypByApp = new Map();
for (const l of fs.readFileSync("data-work/site_coverage.csv", "utf8").split("\n").slice(1).filter(Boolean)) {
  const c = l.split(",");
  const N = c.length;
  if (c[N - 2]) ypByApp.set(Number(c[0]), Number(c[N - 2]));
}

const unknown = new Set();
let tagged = 0,
  empty = 0;
const out = jl("data-work/remake-descriptions.jsonl").map((r) => {
  const tags = [];
  const y = ypByApp.has(r.id) ? yp.get(ypByApp.get(r.id)) : null;
  for (const t of y?.tags ?? []) {
    if (EN[t]) tags.push(t);
    else unknown.add(t);
  }
  const m = app.get(r.id);
  if (m?.elevation_m >= 3000 && !tags.includes("3000m峰")) tags.push("3000m峰");
  tags.length ? tagged++ : empty++;
  return { ...r, tags_ja: tags, tags_en: tags.map((t) => EN[t]) };
});
fs.writeFileSync(
  "data-work/remake-descriptions.jsonl",
  out.map((r) => JSON.stringify(r)).join("\n") + "\n",
);
console.log(`タグあり ${tagged} / なし ${empty}`);
if (unknown.size) console.log("対訳表にないタグ（スキップ）:", [...unknown].join(", "));
