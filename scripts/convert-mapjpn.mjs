// map.jpn.org のクロール結果を public/data/mountains.json 形式へ変換・マージする。
// 使い方: node scripts/convert-mapjpn.mjs <クロールディレクトリ> [--write]
//   --write を付けると public/data/mountains.json を上書き。無指定はドライラン（統計のみ）。
//
// マージ方針:
//   - 既存1,061座（国土地理院「主な山岳」由来）は id・名前・読みを維持する。
//     解説DB（mountain_descriptions.json）が旧 id をキーにしているため。
//     対応する map.jpn.org レコードは座標近傍（1.5km以内）＋名前/読みの一致で対応付け、
//     住所（都道府県）と重要度の補完にのみ使う。
//   - 対応しなかった map.jpn.org レコードは新規に追加。id は 100000 + mapjpn_id。
//   - priority は mapjpn の level を 0..100 に正規化。既存レコードは旧 priority を維持。

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const crawlDir = process.argv[2];
const doWrite = process.argv.includes("--write");
if (!crawlDir) {
  console.error("usage: node scripts/convert-mapjpn.mjs <crawldir> [--write]");
  process.exit(1);
}

const OLD_PATH = "public/data/mountains.json";
const old = JSON.parse(readFileSync(OLD_PATH, "utf8"));
const details = readFileSync(join(crawlDir, "mapjpn_details.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  .filter((r) => !r._error);
console.log(`old: ${old.length}, mapjpn: ${details.length}`);

const PREFS =
  "北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県".split("|");
const prefOf = (addrs) => {
  const seen = [];
  for (const a of addrs ?? []) {
    const p = PREFS.find((p) => a.startsWith(p));
    if (p && !seen.includes(p)) seen.push(p);
  }
  return seen.join("/") || undefined;
};

// 座標グリッドで近傍検索（1セル≈0.02度≈2km）
const CELL = 0.02;
const grid = new Map();
const keyOf = (lat, lon) => `${Math.round(lat / CELL)},${Math.round(lon / CELL)}`;
for (const r of details) {
  r._lat = Number(r.lat);
  r._lon = Number(r.lon);
  const k = keyOf(r._lat, r._lon);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(r);
}
const distM = (la1, lo1, la2, lo2) => {
  const dy = (la2 - la1) * 111320;
  const dx = (lo2 - lo1) * 111320 * Math.cos(((la1 + la2) / 2) * (Math.PI / 180));
  return Math.hypot(dx, dy);
};
const near = (lat, lon, radM) => {
  const out = [];
  const c = Math.ceil(radM / 111320 / CELL);
  const ky = Math.round(lat / CELL), kx = Math.round(lon / CELL);
  for (let dy = -c; dy <= c; dy++)
    for (let dx = -c; dx <= c; dx++)
      for (const r of grid.get(`${ky + dy},${kx + dx}`) ?? []) {
        const d = distM(lat, lon, r._lat, r._lon);
        if (d <= radM) out.push({ r, d });
      }
  return out.sort((a, b) => a.d - b.d);
};

// 読み（ひらがな）→ ヘボン式ローマ字。新規山の機械生成英名（name_en）に使う。
// 長音は簡略化（おう/おお→o, うう→u）し、区切りの「・」は空白にして各語を大文字始まりに。
const ROMA = {
  きゃ: "kya", きゅ: "kyu", きょ: "kyo", しゃ: "sha", しゅ: "shu", しょ: "sho",
  ちゃ: "cha", ちゅ: "chu", ちょ: "cho", にゃ: "nya", にゅ: "nyu", にょ: "nyo",
  ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo", みゃ: "mya", みゅ: "myu", みょ: "myo",
  りゃ: "rya", りゅ: "ryu", りょ: "ryo", ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
  じゃ: "ja", じゅ: "ju", じょ: "jo", ぢゃ: "ja", ぢゅ: "ju", ぢょ: "jo",
  びゃ: "bya", びゅ: "byu", びょ: "byo", ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo",
  ふぁ: "fa", ふぃ: "fi", ふぇ: "fe", ふぉ: "fo", うぇ: "we", うぃ: "wi", とぅ: "tu",
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", ゐ: "i", ゑ: "e", を: "o", ん: "n",
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o", ゔ: "vu", ー: "",
};
const romajiWord = (kana) => {
  let out = "";
  let i = 0;
  while (i < kana.length) {
    if (kana[i] === "っ") {
      const rest = romajiWord(kana.slice(i + 1));
      out += (rest.startsWith("ch") ? "t" : rest[0] ?? "") + rest;
      return out;
    }
    const two = ROMA[kana.slice(i, i + 2)];
    if (two !== undefined) {
      out += two;
      i += 2;
      continue;
    }
    const one = ROMA[kana[i]];
    out += one !== undefined ? one : "";
    i += 1;
  }
  // 長音の簡略化（おう→o, おお→o, うう→u, ああ→a）。ii/ei は残す。
  return out.replace(/ou/g, "o").replace(/oo/g, "o").replace(/uu/g, "u").replace(/aa/g, "a");
};
const kanaToRomaji = (kana) =>
  kataToHira(kana ?? "")
    .split(/[・\s]+/)
    .filter(Boolean)
    .map((w) => {
      const r = romajiWord(w);
      return r ? r[0].toUpperCase() + r.slice(1) : "";
    })
    .filter(Boolean)
    .join(" ") || undefined;

// 名前の照合用正規化（山・岳・ヶ峯等の揺れと中黒区切りを吸収）
const kataToHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const norm = (s) => kataToHira((s ?? "").replace(/[・\s（）()]/g, ""));
const nameMatch = (o, r) => {
  const on = norm(o.name), ok = norm(o.name_kana ?? "");
  if (!on) return false;
  const cands = [[norm(r.name), norm(r.kana ?? "")], ...(r.alias ?? []).map((a) => [norm(a.name), norm(a.kana ?? "")])];
  for (const [rn, rk] of cands) {
    if (rn && (rn.includes(on) || on.includes(rn))) return true;
    if (ok && rk && (rk.includes(ok) || ok.includes(rk))) return true;
  }
  return false;
};

// 既存 → mapjpn の対応付け
const matched = new Map(); // mapjpn id -> old record
let byName = 0, byDistOnly = 0, unmatched = [];
for (const o of old) {
  const cands = near(o.latitude, o.longitude, 1500).filter(({ r }) => !matched.has(r.id));
  const nm = cands.find(({ r }) => nameMatch(o, r));
  if (nm) {
    matched.set(nm.r.id, o);
    o._mj = nm.r;
    byName++;
  } else if (cands.length && cands[0].d <= 300) {
    matched.set(cands[0].r.id, o);
    o._mj = cands[0].r;
    byDistOnly++;
  } else {
    unmatched.push(o);
  }
}
console.log(`matched by name: ${byName}, by distance(<300m): ${byDistOnly}, unmatched old: ${unmatched.length}`);
for (const o of unmatched.slice(0, 15)) console.log(`  unmatched: ${o.id} ${o.name} (${o.prefecture ?? "?"})`);

// priority: mapjpn level を 0..100 に正規化
const levels = details.map((r) => r.level);
const minL = Math.min(...levels), maxL = Math.max(...levels);
const prio = (level) => Math.round(((level - minL) / (maxL - minL)) * 100);
console.log(`level range: ${minL}..${maxL}`);

// 別名: {name, kana(ひらがな)} の配列（検索ヒット用）。空なら省略。
const aliasesOf = (r) => {
  const a = (r?.alias ?? []).map((x) => ({ name: x.name, kana: x.kana ? kataToHira(x.kana) : undefined }));
  return a.length ? a : undefined;
};

// 出力の組み立て
const out = [];
for (const o of old) {
  const mj = o._mj;
  out.push({
    id: o.id,
    source: o.source,
    source_id: o.source_id,
    mapjpn_id: mj?.id,
    name: o.name,
    name_kana: o.name_kana,
    aliases: aliasesOf(mj),
    latitude: o.latitude,
    longitude: o.longitude,
    elevation_m: o.elevation_m,
    prefecture: o.prefecture || (mj ? prefOf(mj.address) : undefined),
    priority: o.priority,
  });
}
let added = 0;
for (const r of details) {
  if (matched.has(r.id)) continue;
  out.push({
    id: 100000 + r.id,
    source: "mapjpn",
    mapjpn_id: r.id,
    name: r.name,
    name_kana: r.kana ? kataToHira(r.kana) : undefined,
    name_en: kanaToRomaji(r.kana), // 機械生成ローマ字英名（例: ふじさん→Fujisan）
    aliases: aliasesOf(r),
    latitude: r._lat,
    longitude: r._lon,
    elevation_m: r.alt,
    prefecture: prefOf(r.address),
    priority: prio(r.level),
  });
  added++;
}
console.log(`output: ${out.length} (existing ${old.length} + added ${added})`);

if (doWrite) {
  writeFileSync(OLD_PATH, JSON.stringify(out));
  console.log(`wrote ${OLD_PATH} (${(JSON.stringify(out).length / 1e6).toFixed(1)} MB)`);
} else {
  console.log("(dry-run: --write で書き込み)");
}
