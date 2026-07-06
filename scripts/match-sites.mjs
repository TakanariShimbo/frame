// アプリの山辞書 (public/data/mountains.json) の各山に対して、
// ヤマケイ山ナビ / YAMAP / Wikipedia に対応ページがあるかを O / X で CSV にまとめる。
//
// 使い方:
//   node scripts/match-sites.mjs > data-work/site_coverage.csv
//   （data-work/yamakei_yamanavi.jsonl, yamap_mountains.jsonl, wikipedia_extracts.jsonl を読む）
//   Wikipedia はアプリ山ID で照合済み（fetch-wikipedia.mjs が座標検証する）なので hit/miss をそのまま使う。
//
// 照合方針（同名の山の取り違え防止のため名前＋座標の両方で確認）:
//   1) 名前一致: 正規化した山名（またはかな）が一致し、座標差が 0.1 度以内 → 対応あり
//   2) 座標一致: 名前が照合できなくても、座標差 0.005 度（≒500m）以内で最も近い1件 → 対応あり
//   マッチした site_id も CSV に出す（検証・後段のリメイクで使うため）。

import fs from "node:fs";

const norm = (s) =>
  (s ?? "")
    .normalize("NFKC")
    .replace(/[（(].*?[)）]/g, "")
    .replace(/ヶ/g, "ケ")
    .replace(/ノ/g, "の")
    .replace(/剱/g, "剣")
    .replace(/嶽/g, "岳")
    .replace(/[\s・]/g, "");

const readJsonl = (path) => {
  if (!fs.existsSync(path)) {
    console.error(`warning: ${path} がありません`);
    return [];
  }
  return fs
    .readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
    .filter((r) => !r.miss);
};

const app = JSON.parse(fs.readFileSync("public/data/mountains.json", "utf8"));
const yamakei = readJsonl("data-work/yamakei_yamanavi.jsonl");
const yamap = readJsonl("data-work/yamap_mountains.jsonl");
console.error(`アプリ ${app.length} / ヤマケイ ${yamakei.length} / YAMAP ${yamap.length}`);

// 座標グリッド（0.1度セル）でアプリ山を索引し、近傍検索を速くする
const grid = new Map();
const cellKey = (lat, lon) => `${Math.round(lat * 10)}:${Math.round(lon * 10)}`;
for (const m of app) {
  const k = cellKey(m.latitude, m.longitude);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(m);
}
const near = (lat, lon) => {
  const out = [];
  const clat = Math.round(lat * 10),
    clon = Math.round(lon * 10);
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++) out.push(...(grid.get(`${clat + a}:${clon + b}`) ?? []));
  return out;
};
const dist = (m, r) => Math.max(Math.abs(m.latitude - r.lat), Math.abs(m.longitude - r.lon));

// サイトレコード側からアプリ山への対応を貪欲に決める（1サイトレコード→最良の1山）
function matchSite(records) {
  const map = new Map(); // app id -> site id
  for (const r of records) {
    if (r.lat == null || r.lon == null) continue;
    const cands = near(r.lat, r.lon);
    const rn = norm(r.name),
      rk = norm(r.kana);
    let best = null,
      bestD = Infinity;
    for (const m of cands) {
      const d = dist(m, r);
      const nameHit = (rn && norm(m.name) === rn) || (rk && norm(m.name_kana) === rk);
      const ok = (nameHit && d <= 0.1) || d <= 0.005;
      if (ok && d < bestD) {
        best = m;
        bestD = d;
      }
    }
    if (best && !map.has(best.id)) map.set(best.id, r.id);
  }
  return map;
}

const ykMap = matchSite(yamakei);
const ypMap = matchSite(yamap);

// Wikipedia: fetch-wikipedia.mjs の出力はアプリ山ID キー（hit行= title/url あり）
// nocoord は座標なし記事の救済パス（fetch-wikipedia-nocoord.mjs）の追加ヒット
const wpMap = new Map(
  [...readJsonl("data-work/wikipedia_extracts.jsonl"), ...readJsonl("data-work/wikipedia_extracts_nocoord.jsonl")].map((r) => [r.id, r.title]),
);
console.error(`照合: ヤマケイ ${ykMap.size}/${yamakei.length} / YAMAP ${ypMap.size}/${yamap.length} / Wikipedia ${wpMap.size}`);

const esc = (s) => (/[",\n]/.test(s ?? "") ? `"${s.replace(/"/g, '""')}"` : (s ?? ""));
console.log("id,name,yamakei,yamap,wikipedia,yamakei_id,yamap_id,wikipedia_title");
for (const m of app) {
  const yk = ykMap.get(m.id),
    yp = ypMap.get(m.id),
    wp = wpMap.get(m.id);
  console.log([m.id, esc(m.name), yk ? "O" : "X", yp ? "O" : "X", wp ? "O" : "X", yk ?? "", yp ?? "", esc(wp ?? "")].join(","));
}
