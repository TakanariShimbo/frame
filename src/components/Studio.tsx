import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useModeT } from "../lib/useModeT";
import { formatElev, formatElevTitle, getAppMode } from "../lib/mode";
import { IconDownload, IconCaret, IconChevron, IconEye, IconEyeOff } from "./icons";
import { nameLines, oneLineName, type ArLabel } from "../lib/labels";
import { loadImage, canvasToJpegBlob, releaseCanvas, saveBlob } from "../lib/exportImage";
import { readShootingInfo } from "../lib/exif";
import FsSlider from "./FsSlider";

// ============================================================================
// 仕上げ（Studio）。元 trace「山を写す(AR)」の書き出し工程を、3D・撮影地点・向き合わせ
// を取り除いて独立させたもの。テンプレートを選び、文字・解説・余白を整えて JPEG を書き出す。
// 描画ロジック（bakeComposite）と可動編集（名札/解説/タイトルのドラッグ）は trace から忠実に移植。
// ============================================================================

// 県名→英語（タグ「場所」の英語表示用）。「県/府/都」を除いたヘボン式。北海道は Hokkaido。
const PREF_EN: Record<string, string> = {
  北海道: "Hokkaido", 青森県: "Aomori", 岩手県: "Iwate", 宮城県: "Miyagi", 秋田県: "Akita",
  山形県: "Yamagata", 福島県: "Fukushima", 茨城県: "Ibaraki", 栃木県: "Tochigi", 群馬県: "Gunma",
  埼玉県: "Saitama", 千葉県: "Chiba", 東京都: "Tokyo", 神奈川県: "Kanagawa", 新潟県: "Niigata",
  富山県: "Toyama", 石川県: "Ishikawa", 福井県: "Fukui", 山梨県: "Yamanashi", 長野県: "Nagano",
  岐阜県: "Gifu", 静岡県: "Shizuoka", 愛知県: "Aichi", 三重県: "Mie", 滋賀県: "Shiga",
  京都府: "Kyoto", 大阪府: "Osaka", 兵庫県: "Hyogo", 奈良県: "Nara", 和歌山県: "Wakayama",
  鳥取県: "Tottori", 島根県: "Shimane", 岡山県: "Okayama", 広島県: "Hiroshima", 山口県: "Yamaguchi",
  徳島県: "Tokushima", 香川県: "Kagawa", 愛媛県: "Ehime", 高知県: "Kochi", 福岡県: "Fukuoka",
  佐賀県: "Saga", 長崎県: "Nagasaki", 熊本県: "Kumamoto", 大分県: "Oita", 宮崎県: "Miyazaki",
  鹿児島県: "Kagoshima", 沖縄県: "Okinawa",
  // フィーチャーエントリの「場所」欄（県名の代わりにイベント名を入れる場合）の英語表記
  長岡花火: "Nagaoka Fireworks",
};
const prefEn = (pref: string) =>
  pref.split("/").map((p) => PREF_EN[p.trim()] ?? p.trim().replace(/[県府都道]$/, "")).join(" / ");

// "#ffffff" など hex を "r,g,b" に変換（rgba 生成用）。
const hexToRgb = (hex: string): string => {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) || 0;
  const g = parseInt(m.slice(2, 4), 16) || 0;
  const b = parseInt(m.slice(4, 6), 16) || 0;
  return `${r},${g},${b}`;
};
// 記録の帯の文字色。余白色の明るさで濃色/淡色を切り替える（liit 風の2トーン）。
// 記録の帯の書体は山名・題字と同じ10種類のフォントペアから選ぶ。既定の「ベーシック」
// (Inter + Noto Sans JP) は liit の端末標準サンセリフとほぼ同じ見た目で、端末差もない。
const exifInk = (marginColor: string): { main: string; sub: string } => {
  const [r, g, b] = hexToRgb(marginColor).split(",").map(Number);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 140 ? { main: "#3c3c3c", sub: "#969696" } : { main: "#f2efe8", sub: "#909090" };
};
// 余白の色を写真の縁から動的に決める（夕焼け＝橙寄り・青空＝水色寄り。「空」「間」テンプレ向け）。
const samplePhotoEdgeColor = async (
  url: string,
  crop: { l: number; t: number; r: number; b: number },
  margin: { t: number; r: number; b: number; l: number },
): Promise<string | null> => {
  let img: HTMLImageElement;
  try {
    img = await loadImage(url);
  } catch {
    return null;
  }
  const W = img.naturalWidth, H = img.naturalHeight;
  if (!W || !H) return null;
  const cl = crop.l * W, ct = crop.t * H;
  const cw = Math.max(1, W * (1 - crop.l - crop.r));
  const ch = Math.max(1, H * (1 - crop.t - crop.b));
  const scale = Math.min(1, 256 / Math.max(cw, ch));
  const sw = Math.max(1, Math.round(cw * scale));
  const sh = Math.max(1, Math.round(ch * scale));
  const cv = document.createElement("canvas");
  cv.width = sw;
  cv.height = sh;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, cl, ct, cw, ch, 0, 0, sw, sh);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, sw, sh).data;
  } catch {
    return null;
  } finally {
    releaseCanvas(cv);
  }
  const band = (n: number) => Math.max(1, Math.round(n * 0.08));
  let r = 0, g = 0, b = 0, n = 0;
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * sw + x) * 4;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n++;
      }
  };
  const any = margin.t > 0 || margin.b > 0 || margin.l > 0 || margin.r > 0;
  if (!any || margin.t > 0) add(0, 0, sw, band(sh));
  if (margin.b > 0) add(0, sh - band(sh), sw, sh);
  if (margin.l > 0) add(0, 0, band(sw), sh);
  if (margin.r > 0) add(sw - band(sw), 0, sw, sh);
  if (!n) return null;
  const hx = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hx(r)}${hx(g)}${hx(b)}`;
};
// ドラッグのスナップ。中央(0.5)と上下左右端（端から SNAP_PAD 内側）で一度止まる。
const SNAP_DIST = 0.02;
const SNAP_PAD = 0.04;
const SNAP_LINES = [SNAP_PAD, 0.5, 1 - SNAP_PAD];
// pos(アンカー座標)＋offs(アンカーから要素の端・中央までの距離)が基準線に近ければ、
// その線に吸着させた pos と、吸着先の線位置（ガイド描画用）を返す。
const snapAxis = (pos: number, offs: number[]): { pos: number; line: number | null } => {
  let best = pos;
  let line: number | null = null;
  let bestD = SNAP_DIST;
  for (const o of offs)
    for (const L of SNAP_LINES) {
      const d = Math.abs(pos + o - L);
      if (d < bestD) {
        bestD = d;
        best = L - o;
        line = L;
      }
    }
  return { pos: best, line };
};

const isDarkColor = (hex: string): boolean => {
  const [r, g, b] = hexToRgb(hex).split(",").map(Number);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
};
const contrastShadow = (textColor: string, dark = 0.82): string =>
  isDarkColor(textColor) ? "rgba(255,255,255,0.5)" : `rgba(0,0,0,${dark})`;
const tagBg = (textColor: string): string =>
  isDarkColor(textColor) ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.4)";

// 文字背景パネル。「あり(solid)」は選んだ色＋濃さ(不透明度)で塗る。デフォルトは50%の半透明。
type BgPanel = "none" | "solid";
const DEFAULT_PANEL_OPACITY = 0.5;
const panelRgba = (hex: string, opacity: number): string => `rgba(${hexToRgb(hex)},${opacity})`;

// ふち（フェード）の S字イージング停止点。t=0(縁,不透明)→t=1(内側,透明)。
const FADE_STOPS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map((t) => ({
  t,
  a: 1 - (3 * t * t - 2 * t * t * t),
}));

// ラベルの内容パターン（1段目=主名／2段目=補足の組み合わせ）。
type LabelMode = "jaSubEnElev" | "jaSubEn" | "jaSubElev" | "enSubElev" | "jaOnly" | "enOnly";

// 焼き込み文字の役割（サイズ・フォントを役割ごとに設定する単位）。
type FontRole = "labelName" | "labelSub" | "captionTitle" | "captionBody";
type FontPairId =
  | "gothic"
  | "roundedGothic"
  | "modernGothic"
  | "mincho"
  | "posterMincho"
  | "brush"
  | "travelNote"
  | "handPen"
  | "maruMoji"
  | "decoMincho";
type FontPair = {
  label: string;
  jp: string;
  en: string;
  description: string;
  // 細い/太いで使う実ウェイト（フォントごとに持てる最小・最大へ割り当てる）。
  // 中くらいは従来どおり 500（本文のみ400）で、既定の見た目を変えない。
  wLight: number;
  wBold: number;
  // 1ウェイトしか存在しない書体（筆記系）。太字/細字は縁取り・エロージョンで擬似的に作る。
  synth?: boolean;
};
type RoleFonts = Record<FontRole, FontPairId>;

// 選べるフォントペア（和文＋欧文のセット。index.html で Google Fonts を読み込み）。
// label はUI言語によらず常にこの表記のまま（山名同様、フォント名は翻訳しない）。
// description はUI言語で切り替えるため、ここには i18n キーを入れ、参照側で t() する。
const FONT_PAIRS: Record<FontPairId, FontPair> = {
  gothic: { label: "ベーシック", jp: "Noto Sans JP", en: "Inter", description: "studio.font.gothic.description", wLight: 200, wBold: 900 },
  roundedGothic: { label: "やわらか", jp: "M PLUS Rounded 1c", en: "Nunito", description: "studio.font.roundedGothic.description", wLight: 300, wBold: 900 },
  modernGothic: { label: "モダン", jp: "Zen Kaku Gothic New", en: "Montserrat", description: "studio.font.modernGothic.description", wLight: 300, wBold: 900 },
  mincho: { label: "上品", jp: "Noto Serif JP", en: "Noto Serif", description: "studio.font.mincho.description", wLight: 200, wBold: 900 },
  posterMincho: { label: "クラシック", jp: "Shippori Mincho", en: "Cormorant Garamond", description: "studio.font.posterMincho.description", wLight: 400, wBold: 800 },
  brush: { label: "和筆", jp: "Yuji Syuku", en: "Great Vibes", description: "studio.font.brush.description", wLight: 300, wBold: 700, synth: true },
  travelNote: { label: "旅ノート", jp: "Yomogi", en: "Caveat", description: "studio.font.travelNote.description", wLight: 300, wBold: 700, synth: true },
  handPen: { label: "手書きペン", jp: "Zen Kurenaido", en: "Patrick Hand", description: "studio.font.handPen.description", wLight: 300, wBold: 700, synth: true },
  maruMoji: { label: "まる文字", jp: "Zen Maru Gothic", en: "Quicksand", description: "studio.font.maruMoji.description", wLight: 300, wBold: 900 },
  decoMincho: { label: "デコ明朝", jp: "Kaisei Decol", en: "Cormorant Infant", description: "studio.font.decoMincho.description", wLight: 400, wBold: 700 },
};
const FONT_PAIR_IDS = Object.keys(FONT_PAIRS) as FontPairId[];
const DEFAULT_ROLE_FONTS: RoleFonts = {
  labelName: "gothic",
  labelSub: "gothic",
  captionTitle: "gothic",
  captionBody: "gothic",
};
// 欧文を先・和文を後に並べ、ラテン字は欧文フォント・CJKは和文フォントが当たるようにする。
const roleFontStack = (id: FontPairId) => {
  const p = FONT_PAIRS[id];
  return `"${p.en}", "${p.jp}", system-ui, sans-serif`;
};

// 文字の太さ（細い/中くらい/太いの3段階）。実ウェイトはフォントごとの
// wLight/wBold を使い、「中くらい」は従来どおり 500（本文のみ400）を維持する。
type FontWeightLevel = "light" | "medium" | "bold";
const FONT_WEIGHT_LEVELS: FontWeightLevel[] = ["light", "medium", "bold"];
type RoleWeights = Record<FontRole, FontWeightLevel>;
const DEFAULT_ROLE_WEIGHTS: RoleWeights = {
  labelName: "bold",
  labelSub: "medium",
  captionTitle: "bold",
  captionBody: "medium",
};
const pairWeightPx = (id: FontPairId, role: FontRole | "title", level: FontWeightLevel): number => {
  const p = FONT_PAIRS[id];
  return level === "light" ? p.wLight : level === "bold" ? p.wBold : role === "captionBody" ? 400 : 500;
};
// 擬似太字の縁取り量（フォントサイズに対する比）。1ウェイト書体の太字だけ >0。
const pairSynthBold = (id: FontPairId, level: FontWeightLevel): number =>
  FONT_PAIRS[id].synth && level === "bold" ? 0.028 : 0;
// 擬似細字（エロージョン半径のフォントサイズ比）。まず題字のみで使う実験機能。
const pairSynthLight = (id: FontPairId, level: FontWeightLevel): number =>
  FONT_PAIRS[id].synth && level === "light" ? 0.016 : 0;
// 題字の副行（場所・標高）は主行より一段細くする（従来: 主700/副500 の関係を保つ）。
const titleSubWeightPx = (main: number): number => (main >= 700 ? 500 : main >= 500 ? 400 : 300);

// 仕上げのテンプレート。選ぶと「見た目＋構図」をまとめて適用する値の束。
type ExportStyle = {
  bakeLabels: boolean;
  labelMode: LabelMode;
  labelBg: BgPanel;
  labelPanelColor: string;
  labelPanelOpacity: number;
  labelColor: string;
  labelShadow: boolean;
  labelLineOn: boolean;
  labelLineColor: string;
  labelNameScale: number;
  labelSubScale: number;
  labelLetterSpace: number; // 字間（em。0=標準）
  labelLineHeight: number; // 山名と補足の行間（倍率。1=標準）
  captionLang: "ja" | "en" | "both" | "none";
  captionLayout: "horizontal" | "vertical";
  captionTitleMode: "each" | "groupV" | "groupH" | "ja" | "en";
  captionLength: "long" | "short";
  captionBg: BgPanel;
  captionPanelColor: string;
  captionPanelOpacity: number;
  captionColor: string;
  captionShadow: boolean;
  captionTitleScale: number;
  captionBodyScale: number;
  captionLetterSpace: number; // 字間（em。0=標準）
  captionLineHeight: number; // 本文の行間（倍率。1=標準）
  captionPos: { u: number; v: number };
  captionW: number;
  captionSplit: number;
  tagColor: string;
  tagColorTarget: "bg" | "text";
  capShowElev: boolean;
  capShowLoc: boolean;
  capSelectedTags: string[];
  titleOn: boolean;
  titleLang: "en" | "ja";
  titleShowOver: boolean;
  titleShowNum: boolean;
  titleScale: number;
  titleSideScale?: number; // 上下（小見出し・標高）のサイズ倍率。未指定=1
  titleW?: number; // 題字の折り返し幅（写真幅比）。未指定は0.98（写真幅いっぱい）
  titleColor: string;
  titleShadow: boolean;
  titleFont: FontPairId;
  titleLetterSpace: number; // 字間（既定スペーシングへの倍率。1=標準）
  titleLineHeight: number; // 3段（場所/山名/標高）の行間（倍率。1=標準）
  titlePos: { u: number; v: number };
  titleWeight: FontWeightLevel;
  roleFonts: RoleFonts;
  roleWeights: RoleWeights;
  frameMargin: { t: number; r: number; b: number; l: number };
  frameMarginColor: string;
  frameMarginAuto: boolean;
  cropInset: { l: number; t: number; r: number; b: number };
  frameFade: number;
};
type ExportTemplate = { id: string; name: string; sub: string; hint: string; style: ExportStyle };

const GOLD = "#d6b46a";
const NO_MARGIN = { t: 0, r: 0, b: 0, l: 0 };
const NO_CROP = { l: 0, t: 0, r: 0, b: 0 };
const BASE_STYLE: ExportStyle = {
  bakeLabels: true,
  labelMode: "jaSubElev",
  labelBg: "none",
  labelPanelColor: "#1f2633",
  labelPanelOpacity: DEFAULT_PANEL_OPACITY,
  labelColor: "#ffffff",
  labelShadow: true,
  labelLineOn: true,
  labelLineColor: "#ffffff",
  labelNameScale: 1,
  labelSubScale: 1,
  labelLetterSpace: 0,
  labelLineHeight: 1,
  captionLang: "none",
  captionLayout: "horizontal",
  captionTitleMode: "each",
  captionLength: "short",
  captionBg: "none",
  captionPanelColor: "#1f2633",
  captionPanelOpacity: DEFAULT_PANEL_OPACITY,
  captionColor: "#ffffff",
  captionShadow: true,
  captionTitleScale: 1,
  captionBodyScale: 1,
  captionLetterSpace: 0,
  captionLineHeight: 1,
  captionPos: { u: 0.05, v: 0.62 },
  captionW: 0.55,
  captionSplit: 0.5,
  tagColor: GOLD,
  tagColorTarget: "bg",
  capShowElev: false,
  capShowLoc: false,
  capSelectedTags: [],
  titleOn: false,
  titleLang: "en",
  titleShowOver: true,
  titleShowNum: true,
  titleScale: 1,
  titleColor: "#ffffff",
  titleShadow: true,
  titleFont: "posterMincho",
  titleLetterSpace: 1,
  titleLineHeight: 1,
  titlePos: { u: 0.5, v: 0.44 },
  titleWeight: "bold",
  roleFonts: DEFAULT_ROLE_FONTS,
  roleWeights: DEFAULT_ROLE_WEIGHTS,
  frameMargin: NO_MARGIN,
  frameMarginColor: "#ffffff",
  frameMarginAuto: false,
  cropInset: NO_CROP,
  frameFade: 0,
};
// テンプレートは「図(zu)」=3Dミニマップ入りを除いた5種（栞・双は「語」に統合）。
// name は漢字のままUI言語によらず不変（山名同様、テーマ名は翻訳しない）。
// sub/hint はUI言語で切り替えるため、ここには i18n キーを入れ、参照側で t() する。
const EXPORT_TEMPLATES: ExportTemplate[] = [
  {
    id: "miyabi",
    name: "雅",
    sub: "studio.theme.miyabi.sub",
    hint: "studio.theme.miyabi.hint",
    style: {
      ...BASE_STYLE,
      labelMode: "jaSubEnElev",
      labelNameScale: 1.2,
      labelSubScale: 0.85,
      roleFonts: { labelName: "posterMincho", labelSub: "mincho", captionTitle: "gothic", captionBody: "gothic" },
    },
  },
  {
    id: "chou",
    name: "頂",
    sub: "studio.theme.chou.sub",
    hint: "studio.theme.chou.hint",
    style: {
      ...BASE_STYLE,
      bakeLabels: false,
      captionLang: "none",
      titleOn: true,
      titleLang: "en",
      titleShowOver: true,
      titleShowNum: true,
      titleScale: 1.35,
      titleColor: "#ffffff",
      titleShadow: true,
      titleFont: "posterMincho",
      titlePos: { u: 0.5, v: 0.46 },
    },
  },
  {
    id: "katari",
    name: "語",
    sub: "studio.theme.katari.sub",
    hint: "studio.theme.katari.hint",
    style: {
      ...BASE_STYLE,
      bakeLabels: false,
      labelMode: "jaSubEnElev",
      labelNameScale: 1.2,
      labelSubScale: 0.85,
      captionLang: "both",
      captionLength: "long",
      captionTitleScale: 1.4,
      captionBodyScale: 0.85,
      captionPos: { u: 0.05, v: 0.67 },
      captionW: 0.877,
      captionSplit: 0.413,
      tagColor: "#ffffff",
      roleFonts: { labelName: "posterMincho", labelSub: "mincho", captionTitle: "posterMincho", captionBody: "modernGothic" },
    },
  },
  {
    id: "ma",
    name: "間",
    sub: "studio.theme.ma.sub",
    hint: "studio.theme.ma.hint",
    style: {
      ...BASE_STYLE,
      bakeLabels: false,
      labelMode: "jaSubEnElev",
      labelNameScale: 1.2,
      labelSubScale: 0.85,
      captionLang: "both",
      captionLayout: "vertical",
      captionTitleMode: "groupV",
      captionLength: "long",
      captionColor: "#0e1f05",
      captionShadow: false,
      captionTitleScale: 2,
      captionBodyScale: 0.8,
      captionPos: { u: -0.081, v: 0.176 },
      captionW: 0.229,
      tagColor: "#7a7052",
      capShowElev: true,
      capShowLoc: true,
      roleFonts: { labelName: "posterMincho", labelSub: "mincho", captionTitle: "posterMincho", captionBody: "gothic" },
      frameMargin: { t: 0, r: 0, b: 0, l: 0.39 },
      frameMarginColor: "#c9bc8d",
      cropInset: { l: 0.15, t: 0, r: 0.2, b: 0 },
      frameFade: 0.21,
    },
  },
  {
    id: "sora",
    name: "空",
    sub: "studio.theme.sora.sub",
    hint: "studio.theme.sora.hint",
    style: {
      ...BASE_STYLE,
      bakeLabels: false,
      labelMode: "jaSubEnElev",
      labelNameScale: 1.2,
      labelSubScale: 0.85,
      captionLang: "both",
      captionLayout: "vertical",
      captionTitleMode: "groupV",
      captionLength: "long",
      captionShadow: false,
      captionTitleScale: 2,
      captionBodyScale: 0.95,
      captionPos: { u: 0.175, v: -0.666 },
      captionW: 0.641,
      tagColor: "#ffffff",
      tagColorTarget: "text",
      roleFonts: { labelName: "posterMincho", labelSub: "mincho", captionTitle: "posterMincho", captionBody: "gothic" },
      frameMargin: { t: 0.8, r: 0, b: 0, l: 0 },
      frameMarginColor: "#749acc",
      frameMarginAuto: true,
      frameFade: 0.26,
    },
  },
];

// テンプレを写真の向きに合わせて回す（横長基準。縦長は辺を入れ替える）。
// テーマ選択カルーセルの並び（テンプレ5種＋「素」=テーマなし）。
type TplItem = { id: string; name: string; sub: string; hint: string; tpl: ExportTemplate | null };
// プレビュー画像のキャッシュバスター。同名のまま画像を差し替えたら数字を上げること
// （public/ 配下はハッシュ付与されず、GitHub Pages 等でブラウザキャッシュが残るため）。
const TPL_PREVIEW_VER = "?v=4";
const TPL_ITEMS: TplItem[] = [
  ...EXPORT_TEMPLATES.map((t) => ({ id: t.id, name: t.name, sub: t.sub, hint: t.hint, tpl: t as ExportTemplate | null })),
  { id: "custom", name: "素", sub: "studio.theme.custom.sub", hint: "studio.theme.custom.hint", tpl: null },
];

// スマホ判定（テーマ選択をスワイプ式に切り替える）。
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 720px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const fn = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return narrow;
}

const orientStyle = (t: ExportTemplate, portrait: boolean): ExportStyle => {
  const s = t.style;
  if (!portrait) return s;
  if (t.id === "ma") {
    return {
      ...s,
      cropInset: { l: 0, t: s.cropInset.l, r: 0, b: s.cropInset.r },
      frameMargin: { t: s.frameMargin.l, r: 0, b: 0, l: 0 },
      captionLayout: "horizontal",
      captionTitleMode: "groupH",
      captionPos: { u: 0.073, v: -0.07 },
      captionW: 0.86,
      captionSplit: 0.421,
    };
  }
  if (t.id === "sora") {
    return {
      ...s,
      frameMargin: { t: 0, r: 0, b: 0, l: s.frameMargin.t },
      captionPos: { u: -0.688, v: 0.175 },
      captionW: 0.324,
    };
  }
  return s;
};

// 操作パネルのタブID（表示順もこの順）。
// タブの役割分担: 「余白」(frame) は空・間などポスター的な見た目づくり（余白・切り抜き・
// ふち）、「記録」(note) は下の帯に載せる情報（撮影情報や山行記録）。どちらも余白を使うが
// 前者は「形の自由度」、後者は「内容」を編集する。
type PanelTab = "label" | "caption" | "title" | "frame" | "note";
// 「記録」はまだ本番未公開のフィーチャーフラグ付き。コード自体は本番にも入るが、
// ビルド時に VITE_FEATURE_NOTE=1 を渡したとき（と開発サーバー）だけタブを見せる。
// OFF のとき exifOn は常に false のままなので、書き出し・保存への影響もない。
const NOTE_ENABLED = import.meta.env.VITE_FEATURE_NOTE === "1" || import.meta.env.DEV;
const PANEL_TABS: PanelTab[] = NOTE_ENABLED
  ? ["label", "caption", "title", "frame", "note"]
  : ["label", "caption", "title", "frame"];
// テンプレが実際に使う機能からタブを導出する（シンプルモードの表示対象）。
const templateTabs = (s: ExportStyle): PanelTab[] => {
  const tabs: PanelTab[] = [];
  if (s.bakeLabels) tabs.push("label");
  if (s.captionLang !== "none") tabs.push("caption");
  if (s.titleOn) tabs.push("title");
  const m = s.frameMargin;
  const c = s.cropInset;
  if (m.t > 0 || m.r > 0 || m.b > 0 || m.l > 0 || s.frameFade > 0 || c.l > 0 || c.t > 0 || c.r > 0 || c.b > 0)
    tabs.push("frame");
  return tabs;
};

const PANEL_MODE_KEY = "frame.panelMode";

// 仕上げ画面の編集状態まるごと（一覧へ戻っても復元できるように）。
// style はテンプレと同じ ExportStyle、labels はドラッグ位置・本文編集込みの現在値。
export type StudioSnapshot = {
  style: ExportStyle;
  templateId: string | null;
  labels: ArLabel[];
  captionIdx: number;
  // 撮影情報フレーム（liit 風）。テンプレとは独立の設定なので style ではなくここに持つ
  // （テンプレを切り替えても消えない）。
  exif?: {
    on: boolean;
    model: string;
    maker: string;
    spec: string;
    // 追加分（旧スナップショットには無いので optional）: 帯のモード・自由入力・書体・地色
    mode?: "camera" | "free";
    line1?: string;
    line2?: string;
    serif?: boolean; // 旧: 明朝/ゴシック2択（font が無いスナップショットの引き継ぎ用）
    font?: FontPairId;
    bg?: string;
    band?: number;
    italic?: boolean; // 旧: 全体指定（l1/l2 が無いスナップショットの引き継ぎ用）
    bold?: boolean; // 旧: 同上
    l1?: { bold: boolean; italic: boolean; dim: boolean };
    l2?: { bold: boolean; italic: boolean; dim: boolean };
    inkAuto?: boolean;
    ink?: string;
  };
};

type StudioProps = {
  photoUrl: string;
  initialLabels: ArLabel[];
  // 一覧から再編集で入るときの復元データ。あれば initialLabels より優先。
  initialSnapshot?: StudioSnapshot | null;
  // 一覧へ戻る。編集状態（テンプレ選択前なら null）と、この画面で保存に成功したかを渡す。
  onExit: (snapshot: StudioSnapshot | null, saved: boolean) => void;
  // この写真の山選びへ戻る（編集は破棄）。
  onReselect: () => void;
  // 次のまだ保存していない写真へ。残りがあるときだけ渡される。
  nextCount?: number;
  onNext?: (snapshot: StudioSnapshot | null, saved: boolean) => void;
};

export default function Studio({ photoUrl, initialLabels, initialSnapshot = null, onExit, onReselect, nextCount = 0, onNext }: StudioProps) {
  const { t } = useModeT();
  // 復元用スタイル（一覧からの再編集時のみ non-null）。各stateの初期値に使う。
  const initStyle = initialSnapshot?.style;

  // 仕上げ画面の表示モード。入った直後はテンプレ選択、選ぶと編集へ。復元時は編集へ直行。
  const [exportView, setExportView] = useState<"template" | "edit">(initialSnapshot ? "edit" : "template");
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(initialSnapshot?.templateId ?? null);

  // 一度でも編集に入ったか。テーマ選択に「戻る」だけでは編集内容を捨てない（一覧へ
  // 戻るときのスナップショット保存はこのフラグで判定する）。
  const [everEdited, setEverEdited] = useState(!!initialSnapshot);

  // 編集対象の山ラベル（入口で組み立て済み）。座標は写真フレーム内の正規化値(0..1)。
  const [arLabels, setArLabels] = useState<ArLabel[]>(initialSnapshot?.labels ?? initialLabels);
  // 下部キャプション・センタータイトルで取り上げる山（arLabels 内の index）。
  const [captionIdx, setCaptionIdx] = useState(() => {
    if (initialSnapshot) return initialSnapshot.captionIdx;
    const i = initialLabels.findIndex((l) => l.description);
    return i >= 0 ? i : 0;
  });

  // --- 山名ラベル --- //
  const [bakeLabels, setBakeLabels] = useState(initStyle?.bakeLabels ?? true);
  const [labelMode, setLabelMode] = useState<LabelMode>(initStyle?.labelMode ?? "jaSubEnElev");
  const [labelColor, setLabelColor] = useState(initStyle?.labelColor ?? "#ffffff");
  const [labelShadow, setLabelShadow] = useState(initStyle?.labelShadow ?? true);
  const [labelBg, setLabelBg] = useState<BgPanel>(initStyle?.labelBg ?? "none");
  const [labelPanelColor, setLabelPanelColor] = useState(initStyle?.labelPanelColor ?? "#1f2633");
  const [labelPanelOpacity, setLabelPanelOpacity] = useState(initStyle?.labelPanelOpacity ?? DEFAULT_PANEL_OPACITY);
  const [labelLineOn, setLabelLineOn] = useState(initStyle?.labelLineOn ?? true);
  const [labelLineColor, setLabelLineColor] = useState(initStyle?.labelLineColor ?? "#ffffff");
  const [labelNameScale, setLabelNameScale] = useState(initStyle?.labelNameScale ?? 1);
  const [labelSubScale, setLabelSubScale] = useState(initStyle?.labelSubScale ?? 1);
  const [labelLetterSpace, setLabelLetterSpace] = useState(initStyle?.labelLetterSpace ?? 0);
  const [labelLineHeight, setLabelLineHeight] = useState(initStyle?.labelLineHeight ?? 1);
  const labelHasSub = labelMode !== "jaOnly" && labelMode !== "enOnly";

  // --- 解説（キャプション） --- //
  const [captionLang, setCaptionLang] = useState<"ja" | "en" | "both" | "none">(initStyle?.captionLang ?? "none");
  const [captionLayout, setCaptionLayout] = useState<"horizontal" | "vertical">(initStyle?.captionLayout ?? "horizontal");
  const [captionTitleMode, setCaptionTitleMode] = useState<"each" | "groupV" | "groupH" | "ja" | "en">(initStyle?.captionTitleMode ?? "each");
  const [captionLength, setCaptionLength] = useState<"long" | "short">(initStyle?.captionLength ?? "long");
  const [captionBg, setCaptionBg] = useState<BgPanel>(initStyle?.captionBg ?? "none");
  const [captionPanelColor, setCaptionPanelColor] = useState(initStyle?.captionPanelColor ?? "#1f2633");
  const [captionPanelOpacity, setCaptionPanelOpacity] = useState(initStyle?.captionPanelOpacity ?? DEFAULT_PANEL_OPACITY);
  const [captionColor, setCaptionColor] = useState(initStyle?.captionColor ?? "#ffffff");
  const [captionShadow, setCaptionShadow] = useState(initStyle?.captionShadow ?? true);
  const [captionTitleScale, setCaptionTitleScale] = useState(initStyle?.captionTitleScale ?? 1);
  const [captionBodyScale, setCaptionBodyScale] = useState(initStyle?.captionBodyScale ?? 1);
  const [captionLetterSpace, setCaptionLetterSpace] = useState(initStyle?.captionLetterSpace ?? 0);
  const [captionLineHeight, setCaptionLineHeight] = useState(initStyle?.captionLineHeight ?? 1);
  const [captionPos, setCaptionPos] = useState(initStyle?.captionPos ?? ({ u: 0.05, v: 0.62 }));
  const [captionW, setCaptionW] = useState(initStyle?.captionW ?? 0.55);
  const [captionSplit, setCaptionSplit] = useState(initStyle?.captionSplit ?? 0.5);

  // --- タグ（ピル） --- //
  const [tagColor, setTagColor] = useState(initStyle?.tagColor ?? GOLD);
  const [tagColorTarget, setTagColorTarget] = useState<"bg" | "text">(initStyle?.tagColorTarget ?? "bg");
  const [capShowElev, setCapShowElev] = useState(initStyle?.capShowElev ?? false);
  const [capShowLoc, setCapShowLoc] = useState(initStyle?.capShowLoc ?? false);
  const [capSelectedTags, setCapSelectedTags] = useState<string[]>(initStyle?.capSelectedTags ?? []);
  const toggleCapTag = (t: string) =>
    setCapSelectedTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  // --- センタータイトル（ポスター風） --- //
  const [titleOn, setTitleOn] = useState(initStyle?.titleOn ?? false);
  const [titleLang, setTitleLang] = useState<"en" | "ja">(initStyle?.titleLang ?? "en");
  const [titleShowOver, setTitleShowOver] = useState(initStyle?.titleShowOver ?? true);
  const [titleShowNum, setTitleShowNum] = useState(initStyle?.titleShowNum ?? true);
  const [titleScale, setTitleScale] = useState(initStyle?.titleScale ?? 1);
  const [titleSideScale, setTitleSideScale] = useState(initStyle?.titleSideScale ?? 1);
  const [titleW, setTitleW] = useState<number | undefined>(initStyle?.titleW);
  const [titleColor, setTitleColor] = useState(initStyle?.titleColor ?? "#ffffff");
  const [titleShadow, setTitleShadow] = useState(initStyle?.titleShadow ?? true);
  const [titleFont, setTitleFont] = useState<FontPairId>(initStyle?.titleFont ?? "posterMincho");
  const [titleWeight, setTitleWeight] = useState<FontWeightLevel>(initStyle?.titleWeight ?? "bold");
  // 擬似細字（題字・実験）: プレビューは feMorphology(erode) で書き出しと同率の半径をかける
  const titleLightSynth = pairSynthLight(titleFont, titleWeight) > 0;
  const [titleErodePx, setTitleErodePx] = useState(0);
  useEffect(() => {
    if (!titleLightSynth) return;
    const measure = () => {
      const el = arFrameRef.current?.querySelector<HTMLElement>(".ar-title-main");
      if (el) setTitleErodePx(Math.max(0.4, parseFloat(getComputedStyle(el).fontSize) * 0.016));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });
  const [titleLetterSpace, setTitleLetterSpace] = useState(initStyle?.titleLetterSpace ?? 1);
  const [titleLineHeight, setTitleLineHeight] = useState(initStyle?.titleLineHeight ?? 1);
  const [titlePos, setTitlePos] = useState(initStyle?.titlePos ?? ({ u: 0.5, v: 0.44 }));
  const titleDragRef = useRef<{ offU: number; offV: number; w: number; h: number } | null>(null);

  // --- フォント（役割ごと） --- //
  const [roleFonts, setRoleFonts] = useState<RoleFonts>(initStyle?.roleFonts ?? DEFAULT_ROLE_FONTS);
  const setRoleFont = (role: FontRole, value: FontPairId) => setRoleFonts((p) => ({ ...p, [role]: value }));
  const [roleWeights, setRoleWeights] = useState<RoleWeights>(initStyle?.roleWeights ?? DEFAULT_ROLE_WEIGHTS);
  const setRoleWeight = (role: FontRole, value: FontWeightLevel) => setRoleWeights((p) => ({ ...p, [role]: value }));

  // --- フレーム（切り抜き・余白・ふち） --- //
  const [cropInset, setCropInset] = useState(initStyle?.cropInset ?? ({ l: 0, t: 0, r: 0, b: 0 }));
  const [frameMargin, setFrameMargin] = useState(initStyle?.frameMargin ?? ({ t: 0, r: 0, b: 0, l: 0 }));
  const [frameMarginColor, setFrameMarginColor] = useState(initStyle?.frameMarginColor ?? "#ffffff");
  const [frameMarginAuto, setFrameMarginAuto] = useState(initStyle?.frameMarginAuto ?? false);
  const [frameFade, setFrameFade] = useState(initStyle?.frameFade ?? 0);

  // --- 記録の帯（liit 風。テンプレと独立で、下の余白に描く） --- //
  // モードは2つ: camera=撮影情報（Shot on 表記）、free=自由入力（山行記録など）。
  const initExif = initialSnapshot?.exif;
  const [exifOn, setExifOn] = useState(initExif?.on ?? false);
  const [noteMode, setNoteMode] = useState<"camera" | "free">(initExif?.mode ?? "camera");
  const [exifModel, setExifModel] = useState(initExif?.model ?? "");
  const [exifMaker, setExifMaker] = useState(initExif?.maker ?? "");
  const [exifSpec, setExifSpec] = useState(initExif?.spec ?? "");
  const [noteLine1, setNoteLine1] = useState(initExif?.line1 ?? "");
  const [noteLine2, setNoteLine2] = useState(initExif?.line2 ?? "");
  // 書体（10種のフォントペア）。旧スナップショットの serif(明朝/ゴシック2択) から引き継ぐ。
  const [noteFont, setNoteFont] = useState<FontPairId>(
    initExif?.font ?? (initExif?.serif === true ? "posterMincho" : initExif?.serif === false ? "modernGothic" : "gothic"),
  );
  // 元写真の EXIF から初期値を補完する（手で入力済みの欄は上書きしない）。
  useEffect(() => {
    let live = true;
    readShootingInfo(photoUrl).then((si) => {
      if (!live || !si) return;
      setExifModel((v) => v || si.model);
      setExifMaker((v) => v || si.maker);
      setExifSpec((v) => v || si.spec);
    });
    return () => {
      live = false;
    };
  }, [photoUrl]);
  // 記録の帯は「余白」タブとは完全に独立した外側のフレーム。今の見た目（余白・色・
  // 切り抜き込み）の外側に、liit の見本比率で縁を一周巻いてそこに文字を描く:
  // 上・左・右 = 写真の高さの3.5%（ピクセル等幅）、下 = 18%（帯）。色も独立（noteBg）。
  const NOTE_EDGE = 0.035;
  const [noteBg, setNoteBg] = useState(initExif?.bg ?? "#ffffff");
  // 文字色。auto=フレーム色の明るさから2トーンを自動決定 / 手動=好きな色（淡い側は半透明で作る）。
  const [noteInkAuto, setNoteInkAuto] = useState(initExif?.inkAuto ?? true);
  const [noteInk, setNoteInk] = useState(initExif?.ink ?? "#3c3c3c");
  const noteInkColors = (): { main: string; sub: string } =>
    noteInkAuto ? exifInk(noteBg) : { main: noteInk, sub: `rgba(${hexToRgb(noteInk)},0.55)` };
  // 下の帯の高さ（写真の高さ比）。文字を入れないときは細くする等、下だけ調整できる。
  const [noteBand, setNoteBand] = useState(initExif?.band ?? 0.18);
  // 自由入力の文字スタイル。行ごとに 太字/斜体/淡色 を指定できる（見本の「1行目=主役・
  // 2行目=補足」の作り分け用）。旧スナップショットの全体指定 italic/bold から引き継ぐ。
  type NoteLineStyle = { bold: boolean; italic: boolean; dim: boolean };
  const initLineStyle = (v: NoteLineStyle | undefined): NoteLineStyle => ({
    bold: v?.bold ?? initExif?.bold ?? false,
    italic: v?.italic ?? initExif?.italic ?? false,
    dim: v?.dim ?? false,
  });
  const [noteL1, setNoteL1] = useState<NoteLineStyle>(initLineStyle(initExif?.l1));
  const [noteL2, setNoteL2] = useState<NoteLineStyle>(initLineStyle(initExif?.l2));
  const toggleExif = (on: boolean) => setExifOn(on);

  // --- 書き出し --- //
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewBaking, setPreviewBaking] = useState(false);
  // 書き出し・保存の失敗をユーザーに知らせるメッセージ（null=非表示）。
  // 書き出し関連の通知。error=失敗（赤）、warn=成功したが注意あり（黄。低解像度フォールバック等）。
  const [exportNotice, setExportNotice] = useState<{ kind: "error" | "warn"; text: string } | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  // 操作パネルのタブ（縦一列の設定を4分類に整理）。復元時はそのスタイルが使う先頭タブ。
  const [panelTab, setPanelTab] = useState<PanelTab>(() => (initStyle ? (templateTabs(initStyle)[0] ?? "label") : "label"));
  // テーマ選択カルーセルの現在位置（スマホ=スワイプ / PC=カバーフロー共通）。
  const [tplIdx, setTplIdx] = useState(() => {
    const i = TPL_ITEMS.findIndex((x) => x.id === activeTemplateId);
    return i >= 0 ? i : 0;
  });
  const tplSwipeRef = useRef<HTMLDivElement | null>(null);
  // PCカバーフローのスワイプ（タブレットのタッチ・マウスドラッグ）。100pxごとに1枚送る。
  const flowDragRef = useRef<{ id: number; startX: number; lastX: number; steps: number; moved: boolean } | null>(null);
  const flowSuppressClick = useRef(false);
  const isNarrow = useIsNarrow();
  // パネル表示モード。シンプル=テンプレに関係するタブだけ / フル=全タブ。選択は次回も引き継ぐ。
  const [panelMode, setPanelMode] = useState<"simple" | "full">(() => {
    try {
      return localStorage.getItem(PANEL_MODE_KEY) === "full" ? "full" : "simple";
    } catch {
      return "simple";
    }
  });

  // --- 計測・ドラッグ --- //
  const [photoNat, setPhotoNat] = useState<{ w: number; h: number } | null>(null);
  const [labelBoxes, setLabelBoxes] = useState<Record<number, { w: number; h: number }>>({});
  const [labelFramePad, setLabelFramePad] = useState<{ h: number; v: number }>({ h: 0, v: 0 });
  const [measureTick, setMeasureTick] = useState(0);
  const arEditStageRef = useRef<HTMLDivElement | null>(null);
  const arFrameRef = useRef<HTMLDivElement | null>(null);
  const noteWrapRef = useRef<HTMLDivElement | null>(null);
  const captionDragRef = useRef<{ offU: number; offV: number; h: number } | null>(null);
  // ドラッグ中にスナップした基準線（フレーム正規化座標）。ガイド線の描画用。
  const [snapGuide, setSnapGuide] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const capResizeRef = useRef<{ side: "l" | "r" | "t" | "b"; startW: number; startV: number; boxLeft: number; boxRight: number } | null>(null);
  // 名札のリサイズ（左右の丸をドラッグ）。文字サイズは変えず、折り返し幅（labelW）を変更する。
  const labelResizeRef = useRef<{ cu: number } | null>(null);
  // 題字のリサイズ（左右の丸）。文字サイズは変えず、折り返し幅（titleW）を変更する。
  const titleResizeRef = useRef<{ cu: number } | null>(null);
  const arDragRef = useRef<{ i: number; kind: "dot" | "label" | "labelAnchor" | "caption" | "capResize" | "capSplit" | "title" | "labelResize" | "titleResize" } | null>(null);

  // 選択中の長さに応じた解説本文（短めが無ければ長めにフォールバック）。
  const descJa = (lb: { description?: string; descriptionShort?: string }) =>
    captionLength === "short" ? lb.descriptionShort || lb.description : lb.description;
  const descEn = (lb: { descriptionEn?: string; descriptionEnShort?: string }) =>
    captionLength === "short" ? lb.descriptionEnShort || lb.descriptionEn : lb.descriptionEn;

  // 指定言語のチップ文字列（高さ→場所→選択タグの順）。
  const capChips = (lb: ArLabel, lang: "ja" | "en"): string[] => {
    const chips: string[] = [];
    if (capShowElev && lb.elevM != null) chips.push(formatElev(lb.elevM, lang === "en"));
    if (capShowLoc && lb.prefecture)
      chips.push(lang === "en" ? prefEn(lb.prefecture) : lb.prefecture.replace(/\//g, "・"));
    const tj = lb.tagsJa ?? [];
    const te = lb.tagsEn ?? [];
    tj.forEach((t, i) => {
      if (capSelectedTags.includes(t)) chips.push(lang === "en" ? te[i] ?? t : t);
    });
    return chips;
  };

  // 解説プレビュー用の派生値（両方表示時の見出し構成）。焼き込み側のロジックと一致させる。
  const capItem = arLabels[captionIdx];
  const capBoth = captionLang === "both" && !!(capItem && descJa(capItem)) && !!(capItem && descEn(capItem));

  // 解説の編集。表示中の言語・長さに対応するフィールドを書き換える（プレビュー・焼き込みに直結）。
  // 辞書に解説がない山でも、ここで書けばキャプションとして表示・焼き込みできる。
  const setCapText = (lang: "ja" | "en", text: string) =>
    setArLabels((p) =>
      p.map((l, i) => {
        if (i !== captionIdx) return l;
        const field =
          lang === "ja"
            ? captionLength === "short" ? "descriptionShort" : "description"
            : captionLength === "short" ? "descriptionEnShort" : "descriptionEn";
        return { ...l, [field]: text || undefined };
      }),
    );
  // 山の基本データ（名前・英語名・標高）の編集。名札・解説見出し・タイトルすべてに反映される。
  const setLabelName = (i: number, value: string) =>
    setArLabels((p) => p.map((l, idx) => (idx === i ? { ...l, name: value } : l)));
  const setLabelNameEn = (i: number, value: string) =>
    setArLabels((p) => p.map((l, idx) => (idx === i ? { ...l, nameEn: value.trim() || undefined } : l)));
  const setLabelElev = (i: number, raw: string) => {
    const v = raw.trim() === "" ? undefined : Number(raw);
    setArLabels((p) =>
      p.map((l, idx) => (idx === i ? { ...l, elevM: v != null && Number.isFinite(v) ? v : undefined } : l)),
    );
  };

  // 写真上の名札・引き出し線の表示/非表示。非表示でも解説・題字の題材候補には残る
  // （例: 自分が立っている山頂を解説したいが、写真上に名札は要らない場合）。
  const setLabelHidden = (i: number, hidden: boolean) =>
    setArLabels((p) => p.map((l, idx) => (idx === i ? { ...l, hidden: hidden || undefined } : l)));

  // 自由タグの追加。取り上げる山の tagsJa/tagsEn 末尾に足し（日英同じ文字列）、表示ONにする。
  const [newTag, setNewTag] = useState("");
  const addCapTag = () => {
    const t = newTag.trim();
    if (!t || !capItem) return;
    setArLabels((p) =>
      p.map((l, i) => {
        if (i !== captionIdx) return l;
        const tj = l.tagsJa ?? [];
        if (tj.includes(t)) return l;
        // tagsEn は tagsJa と同じ並びが前提なので、欠けていれば日本語で埋めてから足す。
        const te = tj.map((x, k) => l.tagsEn?.[k] ?? x);
        return { ...l, tagsJa: [...tj, t], tagsEn: [...te, t] };
      }),
    );
    setCapSelectedTags((p) => (p.includes(t) ? p : [...p, t]));
    setNewTag("");
  };

  const capOrig = capItem ? initialLabels.find((l) => l.id === capItem.id) : undefined;
  const capEdited =
    !!capItem &&
    !!capOrig &&
    (capItem.description !== capOrig.description ||
      capItem.descriptionShort !== capOrig.descriptionShort ||
      capItem.descriptionEn !== capOrig.descriptionEn ||
      capItem.descriptionEnShort !== capOrig.descriptionEnShort);
  const restoreCapText = () =>
    setArLabels((p) =>
      p.map((l, i) =>
        i === captionIdx && capOrig
          ? {
              ...l,
              description: capOrig.description,
              descriptionShort: capOrig.descriptionShort,
              descriptionEn: capOrig.descriptionEn,
              descriptionEnShort: capOrig.descriptionEnShort,
            }
          : l,
      ),
    );
  // 見出しは改行(\n)を維持（横一列 groupH のときだけ表示側で1行に畳む）。
  const capName = nameLines(capItem?.name ?? "").join("\n");
  const capNameEn = nameLines(capItem?.nameEn || capItem?.name || "").join("\n");
  const capColHasTitle = !capBoth || captionTitleMode === "each";
  const capTagLang: "ja" | "en" = captionLang === "en" ? "en" : "ja";
  const capSharedHasTags = !!capItem && capChips(capItem, capTagLang).length > 0;
  const capTagEls = (lang: "ja" | "en") => {
    if (!capItem) return null;
    const chips = capChips(capItem, lang);
    if (!chips.length) return null;
    return (
      <div className="ar-cap-tags">
        {chips.map((c, i) => (
          <span key={i} className="ar-cap-tag">{c}</span>
        ))}
      </div>
    );
  };
  const capSharedTitleParts: { text: string; sub: boolean }[] = !capBoth
    ? []
    : captionTitleMode === "ja"
      ? [{ text: capName, sub: false }]
      : captionTitleMode === "en"
        ? [{ text: capNameEn, sub: false }]
        : captionTitleMode === "groupV" || captionTitleMode === "groupH"
          ? [{ text: capName, sub: false }, { text: capNameEn, sub: true }]
          : [];
  const capSharedRow = captionTitleMode === "groupH";

  // センタータイトルの3段（小見出し=場所 / 大タイトル=山名 / 数値=標高）を「取り上げる山」から作る。
  const titleParts = (): { over: string; main: string; num: string } | null => {
    const it = arLabels[captionIdx];
    if (!it) return null;
    const en = titleLang === "en";
    const up = (s: string) => (en ? s.toUpperCase() : s);
    const main = up(nameLines(en ? it.nameEn || it.name : it.name).join("\n"));
    const over =
      titleShowOver && it.prefecture
        ? up(en ? prefEn(it.prefecture) : it.prefecture.replace(/\//g, "・"))
        : "";
    const num = titleShowNum && it.elevM != null ? formatElevTitle(it.elevM, en) : "";
    return { over, main, num };
  };

  // ラベルの1段目(name)と2段目(sub)の文字列を labelMode から決める。
  // name には編集で入れた改行(\n)がそのまま残り、名札の描画側で複数行に折り返す。
  // 2段目(sub)と英名は1行に畳む。
  const labelContent = (lb: { name: string; nameEn?: string; elevM?: number }) => {
    const ja = lb.name;
    // name欄に使う英名は改行(\n)を維持し、sub欄に使うときだけ1行に畳む。
    const en = nameLines(lb.nameEn || lb.name).join("\n");
    const enSub = oneLineName(lb.nameEn || lb.name);
    // 標高なし（自由入力）の場合は標高部分だけ省いて表示する。
    const elev = lb.elevM != null ? formatElev(lb.elevM) : "";
    switch (labelMode) {
      case "jaOnly":
        return { name: ja, sub: "" };
      case "enOnly":
        return { name: en, sub: "" };
      case "jaSubElev":
        return { name: ja, sub: elev };
      case "enSubElev":
        return { name: en, sub: elev };
      case "jaSubEn":
        return { name: ja, sub: enSub };
      default:
        return { name: ja, sub: [lb.nameEn ? oneLineName(lb.nameEn) : undefined, elev].filter(Boolean).join(" | ") };
    }
  };

  // タグ（ピル）の塗り分け。
  const pillColors = () =>
    tagColorTarget === "bg"
      ? { bg: tagColor, fg: isDarkColor(tagColor) ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.85)" }
      : { bg: tagBg(tagColor), fg: tagColor };

  // 太さ（細い/中くらい/太い）のセレクト。フォントセレクトの隣に並べる。
  const weightSelect = (value: FontWeightLevel, onChange: (v: FontWeightLevel) => void, ariaLabel: string) => (
    <div className="ar-font-sel">
      <select value={value} onChange={(e) => onChange(e.target.value as FontWeightLevel)} aria-label={ariaLabel}>
        {FONT_WEIGHT_LEVELS.map((lv) => (
          <option key={lv} value={lv}>{t(`studio.font.weight.${lv}`)}</option>
        ))}
      </select>
    </div>
  );

  // 役割のフォント選択行（書体＋太さ）。
  const fontRow = (role: FontRole, label: string) => (
    <>
      <div className="ar-fs-row">
        <span>{label}</span>
        <div className="ar-font-sels">
          <div className="ar-font-sel">
            <select value={roleFonts[role]} onChange={(e) => setRoleFont(role, e.target.value as FontPairId)} aria-label={label}>
              {FONT_PAIR_IDS.map((id) => (
                <option key={id} value={id} title={t(FONT_PAIRS[id].description)}>
                  {FONT_PAIRS[id].label}
                </option>
              ))}
            </select>
          </div>
          {weightSelect(roleWeights[role], (v) => setRoleWeight(role, v), t("studio.font.weightAria", { label }))}
        </div>
      </div>
      <p className="ar-font-desc">{t(FONT_PAIRS[roleFonts[role]].description)}</p>
    </>
  );

  // --- フレーム（出力枠）プレビュー幾何。既定（切り抜き0・余白0）では 枠=写真。 --- //
  const fCwF = Math.max(0.1, 1 - cropInset.l - cropInset.r);
  const fChF = Math.max(0.1, 1 - cropInset.t - cropInset.b);
  const fMlr = frameMargin.l + frameMargin.r;
  const fMtb = frameMargin.t + frameMargin.b;
  const fAnyMargin = fMtb > 0 || fMlr > 0;
  // 座標は「写真（切り抜き前の元写真）正規化」で保持。描画時にフレーム座標へ変換する。
  const photoToFrame = (pu: number, pv: number) => ({
    u: (frameMargin.l + (pu - cropInset.l) / fCwF) / (1 + fMlr),
    v: (frameMargin.t + (pv - cropInset.t) / fChF) / (1 + fMtb),
  });
  const frameToPhoto = (fu: number, fv: number) => ({
    u: cropInset.l + (fu * (1 + fMlr) - frameMargin.l) * fCwF,
    v: cropInset.t + (fv * (1 + fMtb) - frameMargin.t) * fChF,
  });
  const fPhotoAR = photoNat ? photoNat.w / photoNat.h : 1;
  const frameAR = fPhotoAR * (fCwF / fChF) * ((1 + fMlr) / (1 + fMtb));
  const framePhotoStyle: React.CSSProperties = {
    position: "absolute",
    left: `${(frameMargin.l / (1 + fMlr)) * 100}%`,
    top: `${(frameMargin.t / (1 + fMtb)) * 100}%`,
    width: `${(1 / (1 + fMlr)) * 100}%`,
    height: `${(1 / (1 + fMtb)) * 100}%`,
    overflow: "hidden",
  };
  const frameCropImgStyle: React.CSSProperties = {
    position: "absolute",
    width: `${(1 / fCwF) * 100}%`,
    height: `${(1 / fChF) * 100}%`,
    left: `${(-cropInset.l / fCwF) * 100}%`,
    top: `${(-cropInset.t / fChF) * 100}%`,
  };
  // ふち（フェード）。余白のある辺だけ、写真領域の内側へ frameFade ぶん余白色へ溶かす。
  const fadeStyle = (dir: "t" | "b" | "l" | "r"): React.CSSProperties | null => {
    if (frameFade <= 0 || frameMargin[dir] <= 0) return null;
    const rgb = hexToRgb(frameMarginColor);
    const pct = `${frameFade * 100}%`;
    const stops = FADE_STOPS.map(({ t, a }) => `rgba(${rgb},${a.toFixed(3)}) ${(t * 100).toFixed(1)}%`).join(", ");
    const grad = (toDir: string) => `linear-gradient(${toDir}, ${stops})`;
    const base: React.CSSProperties = { position: "absolute", pointerEvents: "none" };
    if (dir === "t") return { ...base, left: 0, right: 0, top: 0, height: pct, background: grad("to bottom") };
    if (dir === "b") return { ...base, left: 0, right: 0, bottom: 0, height: pct, background: grad("to top") };
    if (dir === "l") return { ...base, top: 0, bottom: 0, left: 0, width: pct, background: grad("to right") };
    return { ...base, top: 0, bottom: 0, right: 0, width: pct, background: grad("to left") };
  };

  // 引き出し線がラベルの選んだ辺の中点から出る座標（正規化）。
  const labelSidePoint = (i: number) => {
    const lb = arLabels[i];
    const box = labelBoxes[i] ?? { w: 0, h: 0 };
    const { h: ph, v: pv } = labelFramePad;
    const anchor = lb?.labelAnchor ?? "bottom";
    const c = photoToFrame(lb.labelU, lb.labelV);
    if (anchor === "top") return { x: c.u, y: c.v - box.h - pv };
    if (anchor === "left") return { x: c.u - box.w / 2 - ph, y: c.v - box.h / 2 };
    if (anchor === "right") return { x: c.u + box.w / 2 + ph, y: c.v - box.h / 2 };
    return { x: c.u, y: c.v + pv };
  };

  // 余白の色を写真に合わせる（auto）。
  useEffect(() => {
    if (!frameMarginAuto) return;
    let cancelled = false;
    samplePhotoEdgeColor(photoUrl, cropInset, frameMargin).then((c) => {
      if (!cancelled && c) setFrameMarginColor(c);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameMarginAuto, photoUrl, cropInset.l, cropInset.t, cropInset.r, cropInset.b, frameMargin.t, frameMargin.b, frameMargin.l, frameMargin.r]);

  // 出力枠(フレーム)を、外枠(ステージ)内に「contain」で収める px サイズに設定。
  // 記録の帯 ON のときは外側フレーム（縁＋下の帯）込みで収め、内側をその分小さくする。
  useLayoutEffect(() => {
    const stageEl = arEditStageRef.current, frame = arFrameRef.current, wrap = noteWrapRef.current;
    if (!stageEl || !frame || !wrap) return;
    // clientWidth/Height はパディング込み。実際に置ける内容量を使わないと、flex に
    // 横だけ縮められて右の縁が痩せる（帯の高さ変更時に見切れる）。
    const cs = getComputedStyle(stageEl);
    const sw = stageEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const sh = stageEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (!sw || !sh || !frameAR) return;
    // 論理サイズ（切り抜き後の写真高さ ch を基準に、縁・帯の論理量を出す）
    const ch = (photoNat?.h ?? 1000) * fChF;
    const cw = (photoNat?.w ?? 1500) * fCwF;
    const innerW = cw * (1 + fMlr), innerH = ch * (1 + fMtb);
    const edge = exifOn ? NOTE_EDGE * ch : 0;
    const band = exifOn ? noteBand * ch : 0;
    const outerAR = (innerW + edge * 2) / (innerH + edge + band);
    let w = sw, h = sw / outerAR;
    if (h > sh) {
      h = sh;
      w = sh * outerAR;
    }
    const scale = h / (innerH + edge + band);
    const edgePx = Math.round(edge * scale), bandPx = Math.round(band * scale);
    wrap.style.width = `${Math.round(w)}px`;
    wrap.style.height = `${Math.round(h)}px`;
    wrap.style.padding = `${edgePx}px ${edgePx}px ${bandPx}px`;
    frame.style.width = `${Math.round(w) - edgePx * 2}px`;
    frame.style.height = `${Math.round(h) - edgePx - bandPx}px`;
  }, [frameAR, measureTick, exportView, exifOn, noteBand, photoNat, fChF, fCwF, fMlr, fMtb]);

  // ラベル実寸を測って正規化で保持（引き出し線の辺アンカー計算に使う）。
  useLayoutEffect(() => {
    const stage = arFrameRef.current;
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const cq = Math.max(r.width, r.height) / 100;
    const pad = { h: (1.2 * cq) / r.width, v: (0.8 * cq) / r.height };
    setLabelFramePad((prev) => (Math.abs(prev.h - pad.h) < 1e-5 && Math.abs(prev.v - pad.v) < 1e-5 ? prev : pad));
    const next: Record<number, { w: number; h: number }> = {};
    stage.querySelectorAll<HTMLElement>(".ar-edit-label").forEach((el) => {
      const idx = Number(el.dataset.idx);
      if (Number.isNaN(idx)) return;
      const b = el.getBoundingClientRect();
      next[idx] = { w: b.width / r.width, h: b.height / r.height };
    });
    setLabelBoxes((prev) => {
      const ks = Object.keys(next);
      const same =
        ks.length === Object.keys(prev).length &&
        ks.every((k) => prev[+k] && Math.abs(prev[+k].w - next[+k].w) < 1e-4 && Math.abs(prev[+k].h - next[+k].h) < 1e-4);
      return same ? prev : next;
    });
  }, [arLabels, labelMode, labelNameScale, labelSubScale, roleFonts, roleWeights, bakeLabels, exportView, measureTick]);

  // ステージのサイズ変化時に再計測。
  useEffect(() => {
    const stage = arEditStageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setMeasureTick((t) => t + 1));
    ro.observe(stage);
    return () => ro.disconnect();
  }, [exportView]);

  // ============================ 焼き込み（Canvas 2D） ============================ //
  // outCap: 出力長辺の上限(px)。端末のCanvas上限を超えると書き出しが失敗・真っ白になる
  // ため、bakeExport が失敗時により小さい上限で再試行する。
  const bakeComposite = async (img: HTMLImageElement, outCap: number): Promise<Blob | null> => {
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const cl = cropInset.l * W, ct = cropInset.t * H;
    const cw = Math.max(1, W * (1 - cropInset.l - cropInset.r));
    const ch = Math.max(1, H * (1 - cropInset.t - cropInset.b));
    const cwR = Math.round(cw), chR = Math.round(ch);
    const mT = Math.round(frameMargin.t * chR), mB = Math.round(frameMargin.b * chR);
    const mL = Math.round(frameMargin.l * cwR), mR = Math.round(frameMargin.r * cwR);
    const OW = cwR + mL + mR, OH = chR + mT + mB;
    const pfx = (pu: number) => mL + ((pu - cropInset.l) / fCwF) * cwR;
    const pfy = (pv: number) => mT + ((pv - cropInset.t) / fChF) * chR;
    const L = Math.max(OW, OH);
    // 記録の帯（外側フレーム）。「余白」とは独立に、合成結果の外へさらに一周巻く。
    const nEdge = exifOn ? Math.round(NOTE_EDGE * chR) : 0;
    const nBand = exifOn ? Math.round(noteBand * chR) : 0;
    const TW = OW + nEdge * 2, TH = OH + nEdge + nBand;
    // iOS(WebKit)は Canvas の最大ピクセル面積に上限があり、高解像度写真＋大きな余白で
    // 上限を超えると書き出しが真っ白になる。出力長辺を outCap に収めるよう自動縮小する。
    const outScale = Math.min(1, outCap / Math.max(TW, TH));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(TW * outScale));
    canvas.height = Math.max(1, Math.round(TH * outScale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // 以降の描画は論理座標のまま行い、物理キャンバスへ一括縮小して載せる。
    // 外側フレームを塗ってから原点を内側へずらし、既存の描画はそのまま OW×OH 座標で行う。
    ctx.scale(outScale, outScale);
    if (exifOn) {
      ctx.fillStyle = noteBg;
      ctx.fillRect(0, 0, TW, TH);
      ctx.translate(nEdge, nEdge);
    }
    if (mT || mB || mL || mR) {
      ctx.fillStyle = frameMarginColor;
      ctx.fillRect(0, 0, OW, OH);
    }
    ctx.drawImage(img, cl, ct, cw, ch, mL, mT, cwR, chR);
    // drawImage はメモリ上限超過時にエラーを出さず「何も描かない」ことがある
    // （文字と余白だけの白抜け画像の原因）。写真領域を9点サンプリングして、
    // 1点も描けていなければこの解像度は失敗として扱い、縮小リトライへ回す。
    try {
      // 写真の下に塗られている色（内側の余白色 > 外側フレーム色 > なし=透明）。
      const bg = mT || mB || mL || mR ? frameMarginColor : exifOn ? noteBg : null;
      const [mr, mg, mb] = bg ? hexToRgb(bg).split(",").map(Number) : [0, 0, 0];
      let drawn = false;
      for (const fy of [0.1, 0.5, 0.9]) {
        for (const fx of [0.1, 0.5, 0.9]) {
          const px = Math.min(canvas.width - 1, Math.round((nEdge + mL + fx * cwR) * outScale));
          const py = Math.min(canvas.height - 1, Math.round((nEdge + mT + fy * chR) * outScale));
          const d = ctx.getImageData(px, py, 1, 1).data;
          // 下地ありなら「全点が下地色のまま」、なしなら「全点が透明のまま」を未描画とみなす。
          if (bg ? d[0] !== mr || d[1] !== mg || d[2] !== mb : d[3] !== 0) {
            drawn = true;
            break;
          }
        }
        if (drawn) break;
      }
      if (!drawn) {
        releaseCanvas(canvas);
        throw new Error("photo-not-drawn");
      }
    } catch (e) {
      if ((e as Error)?.message === "photo-not-drawn") throw e;
      // getImageData 自体の失敗（検証不能）は描画成功とみなして続行する。
    }
    if (frameFade > 0 && (mT || mB || mL || mR)) {
      const fh = Math.round(frameFade * chR), fw = Math.round(frameFade * cwR);
      const rgba = (a: number) => `rgba(${hexToRgb(frameMarginColor)},${a})`;
      const fade = (x0: number, y0: number, x1: number, y1: number, x: number, y: number, w: number, h: number) => {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        for (const { t, a } of FADE_STOPS) g.addColorStop(t, rgba(a));
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
      };
      if (mT && fh > 0) fade(0, mT, 0, mT + fh, mL, mT, cwR, fh);
      if (mB && fh > 0) fade(0, mT + chR, 0, mT + chR - fh, mL, mT + chR - fh, cwR, fh);
      if (mL && fw > 0) fade(mL, 0, mL + fw, 0, mL, mT, fw, chR);
      if (mR && fw > 0) fade(mL + cwR, 0, mL + cwR - fw, 0, mL + cwR - fw, mT, fw, chR);
    }
    const nameFs = Math.round(L * 0.026 * labelNameScale);
    const subFs = Math.round(L * 0.026 * 0.62 * labelSubScale);
    const ffName = roleFontStack(roleFonts.labelName);
    const ffSub = roleFontStack(roleFonts.labelSub);
    const ffTitle = roleFontStack(roleFonts.captionTitle);
    const ffBody = roleFontStack(roleFonts.captionBody);
    const fwName = pairWeightPx(roleFonts.labelName, "labelName", roleWeights.labelName);
    const fwSub = pairWeightPx(roleFonts.labelSub, "labelSub", roleWeights.labelSub);
    const fwCapTitle = pairWeightPx(roleFonts.captionTitle, "captionTitle", roleWeights.captionTitle);
    const fwCapBody = pairWeightPx(roleFonts.captionBody, "captionBody", roleWeights.captionBody);
    const drawPanel = (x: number, y: number, w: number, h: number, r: number, fill: string) => {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.26)";
      ctx.shadowBlur = Math.round(L * 0.012);
      ctx.shadowOffsetY = Math.round(L * 0.0045);
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
      ctx.restore();
    };
    const fontLoads: Promise<unknown>[] = [];
    for (const [w, id] of [
      [fwName, roleFonts.labelName],
      [fwSub, roleFonts.labelSub],
      [fwCapTitle, roleFonts.captionTitle],
      [fwCapBody, roleFonts.captionBody],
    ] as [number, FontPairId][]) {
      const p = FONT_PAIRS[id];
      fontLoads.push(document.fonts.load(`${w} 16px "${p.jp}"`).catch(() => {}));
      fontLoads.push(document.fonts.load(`${w} 16px "${p.en}"`).catch(() => {}));
    }
    // 記録の帯はアプリの Webフォントで描くため、未ロードだと代替書体で焼かれて
    // プレビューとずれる。選択中のフォントペア（和文・欧文）を待ってから描画する。
    if (exifOn) {
      const p = FONT_PAIRS[noteFont];
      for (const w of [400, 500, 600, 700]) {
        fontLoads.push(document.fonts.load(`${w} 16px "${p.jp}"`).catch(() => {}));
        fontLoads.push(document.fonts.load(`${w} 16px "${p.en}"`).catch(() => {}));
      }
    }
    await Promise.all(fontLoads);
    ctx.textBaseline = "alphabetic";
    // 字間（letter-spacing）。Canvas 未対応ブラウザでは無視される（＝標準字間で描かれる）。
    // measureText も letterSpacing を反映するので、必ず計測の前に設定すること。
    const setLS = (px: number) => {
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${px}px`;
    };
    // 擬似太字: 1ウェイト書体（FONT_PAIRS.synth）は太いウェイトが存在しないため、
    // 太字(>=600)が要求されたときだけ同色の縁取り（strokeText）を重ねて太らせる。
    // ctx.font から書体・サイズを読むので、以降のすべての fillText に自動で効く。
    // プレビュー側は -webkit-text-stroke で同量を付けており、書き出しと一致する。
    const SYNTH_FAMILIES = new Set(
      FONT_PAIR_IDS.filter((id) => FONT_PAIRS[id].synth).flatMap((id) => [FONT_PAIRS[id].jp, FONT_PAIRS[id].en]),
    );
    const rawFillText = ctx.fillText.bind(ctx);
    ctx.fillText = (text: string, x: number, y: number, maxWidth?: number) => {
      const fm = /(\d{3,4})\s+(\d+(?:\.\d+)?)px\s+(.+)$/.exec(ctx.font);
      if (fm && Number(fm[1]) >= 600) {
        const fam = fm[3].split(",")[0].trim().replace(/^"|"$/g, "");
        if (SYNTH_FAMILIES.has(fam)) {
          ctx.save();
          ctx.strokeStyle = ctx.fillStyle as string;
          ctx.lineWidth = Number(fm[2]) * 0.028 * 2; // 縁取りは線幅の半分が外側に出る
          ctx.lineJoin = "round";
          ctx.miterLimit = 2;
          if (maxWidth !== undefined) ctx.strokeText(text, x, y, maxWidth);
          else ctx.strokeText(text, x, y);
          ctx.restore();
        }
      }
      if (maxWidth !== undefined) rawFillText(text, x, y, maxWidth);
      else rawFillText(text, x, y);
    };
    if (bakeLabels) {
      for (const lb of arLabels) {
        if (lb.hidden) continue; // 非表示ラベル（題材専用）は焼き込まない
        const dotX = pfx(lb.dotU);
        const dotY = pfy(lb.dotV);
        const cx = pfx(lb.labelU);
        const cy = pfy(lb.labelV);
        const { name, sub } = labelContent(lb);
        // 山名は改行(\n)で複数行になる。最下行の基準線を従来の nameBaseline に固定し、
        // 上へ積む（ラベルは下端基準で置かれるため、行が増えても位置がずれない）。
        let nameLns = nameLines(name);
        if (nameLns.length === 0) nameLns.push("");
        // 折り返し幅（labelW）が設定されていれば、プレビューと同じく幅で折り返す。
        if (lb.labelW) {
          ctx.font = `${fwName} ${nameFs}px ${ffName}`;
          setLS(nameFs * labelLetterSpace);
          const maxW = lb.labelW * OW;
          const wrapLine = (text: string): string[] => {
            const out: string[] = [];
            let cur = "";
            for (const ch of text) {
              if (cur && ctx.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; }
              else cur += ch;
            }
            if (cur) out.push(cur);
            return out.length ? out : [""];
          };
          nameLns = nameLns.flatMap(wrapLine);
        }
        // 行送りはプレビュー(.ar-edit-label の line-height: 1.12)と揃える。
        const nameLineH = Math.round(nameFs * 1.12);
        const subBaseline = cy;
        const nameBaseline = sub ? cy - Math.round(subFs * 1.35 * labelLineHeight) : cy;
        ctx.font = `${fwName} ${nameFs}px ${ffName}`;
        setLS(nameFs * labelLetterSpace);
        const nameW = Math.max(...nameLns.map((ln) => ctx.measureText(ln).width));
        let subW = 0;
        if (sub) {
          ctx.font = `${fwSub} ${subFs}px ${ffSub}`;
          setLS(subFs * labelLetterSpace);
          subW = ctx.measureText(sub).width;
        }
        const boxW = Math.max(nameW, subW);
        const boxTop = nameBaseline - nameFs - nameLineH * (nameLns.length - 1);
        const boxBottom = cy;
        const boxMidY = (boxTop + boxBottom) / 2;
        const anchor = lb.labelAnchor ?? "bottom";
        const padH = L * 0.012, padV = L * 0.008;
        const ax = anchor === "left" ? cx - boxW / 2 - padH : anchor === "right" ? cx + boxW / 2 + padH : cx;
        const ay = anchor === "top" ? boxTop - padV : anchor === "bottom" ? boxBottom + padV : boxMidY;
        if (labelLineOn) {
          const bx = dotX, by = dotY;
          ctx.strokeStyle = labelLineColor;
          ctx.globalAlpha = 0.9;
          ctx.lineWidth = Math.max(1, L * 0.0022);
          ctx.beginPath();
          ctx.moveTo(ax + (bx - ax) * 0.17, ay + (by - ay) * 0.17);
          ctx.lineTo(ax + (bx - ax) * 0.83, ay + (by - ay) * 0.83);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (labelBg !== "none") {
          drawPanel(cx - boxW / 2 - padH, boxTop - padV, boxW + padH * 2, boxBottom - boxTop + padV * 2, Math.round(L * 0.011), panelRgba(labelPanelColor, labelPanelOpacity));
        }
        ctx.save();
        if (labelShadow) {
          ctx.shadowColor = contrastShadow(labelColor);
          ctx.shadowBlur = Math.round(L * 0.0035);
          ctx.shadowOffsetY = Math.max(1, Math.round(L * 0.001));
        }
        ctx.textAlign = "center";
        ctx.fillStyle = labelColor;
        ctx.font = `${fwName} ${nameFs}px ${ffName}`;
        setLS(nameFs * labelLetterSpace);
        nameLns.forEach((ln, li) => {
          ctx.fillText(ln, cx, nameBaseline - nameLineH * (nameLns.length - 1 - li));
        });
        if (sub) {
          ctx.font = `${fwSub} ${subFs}px ${ffSub}`;
          setLS(subFs * labelLetterSpace);
          ctx.fillText(sub, cx, subBaseline);
        }
        ctx.restore();
      }
      setLS(0);
    }

    // 解説（可動ブロック）。
    const cap = arLabels[captionIdx];
    const capJa = cap ? descJa(cap) : undefined;
    const capEn = cap ? descEn(cap) : undefined;
    if (captionLang !== "none" && cap && (capJa || capEn)) {
      const cols: { title: string; body: string; lang: "ja" | "en" }[] = [];
      if ((captionLang === "ja" || captionLang === "both") && capJa)
        cols.push({ title: nameLines(cap.name).join("\n"), body: capJa, lang: "ja" });
      if ((captionLang === "en" || captionLang === "both") && capEn)
        cols.push({ title: nameLines(cap.nameEn || cap.name).join("\n"), body: capEn, lang: "en" });
      if (cols.length) {
        const titleFs = Math.round(L * 0.026 * captionTitleScale);
        const bodyFs = Math.round(L * 0.02 * captionBodyScale);
        const titleLineH = Math.round(titleFs * 1.3);
        const lineH = Math.round(bodyFs * 1.5 * captionLineHeight);
        const blockW = Math.round(OW * captionW);
        const colGap = Math.round(OW * 0.035);
        const vertical = captionLayout === "vertical" && cols.length > 1;
        const colWidths = vertical
          ? cols.map(() => blockW)
          : cols.length > 1
            ? [Math.round((blockW - colGap) * captionSplit), blockW - colGap - Math.round((blockW - colGap) * captionSplit)]
            : [blockW];
        ctx.textAlign = "left";
        // 全角スペース(U+3000)〜かな・CJK・全角記号。lint(no-irregular-whitespace)対策でエスケープ表記。
        const isCjk = (ch: string) => /[\u3000-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uFF00-\uFFEF]/.test(ch);
        const wrapBody = (text: string, w: number): string[] => {
          const lines: string[] = [];
          let cur = "";
          const place = (unit: string) => {
            if (!cur) {
              if (ctx.measureText(unit).width <= w) { cur = unit; return; }
              let seg = "";
              for (const ch of unit) {
                if (seg && ctx.measureText(seg + ch).width > w) { lines.push(seg); seg = ch; }
                else seg += ch;
              }
              cur = seg;
              return;
            }
            if (ctx.measureText(cur + unit).width <= w) { cur += unit; return; }
            lines.push(cur.replace(/\s+$/, ""));
            cur = "";
            place(unit);
          };
          let i = 0;
          while (i < text.length) {
            const ch = text[i];
            if (ch === "\n") { lines.push(cur.replace(/\s+$/, "")); cur = ""; i++; continue; }
            if (ch === " " || ch === "\t") { if (cur) cur += " "; i++; continue; }
            if (isCjk(ch)) { place(ch); i++; continue; }
            let j = i;
            while (j < text.length && text[j] !== " " && text[j] !== "\t" && text[j] !== "\n" && !isCjk(text[j])) j++;
            place(text.slice(i, j));
            i = j;
          }
          if (cur) lines.push(cur.replace(/\s+$/, ""));
          return lines;
        };
        const wrapped = cols.map((c, ci) => {
          ctx.font = `${fwCapBody} ${bodyFs}px ${ffBody}`;
          setLS(bodyFs * captionLetterSpace); // 折り返し計測にも字間を反映
          return { title: c.title, lines: wrapBody(c.body, colWidths[ci]) };
        });
        const both = cols.length > 1;
        const titleFsSmall = Math.round(titleFs * (captionTitleMode === "groupH" ? 0.8 : 0.6));
        const lineHFor = (fs: number) => Math.round(fs * 1.3);
        const sharedParts: { text: string; fs: number }[] = !both
          ? []
          : captionTitleMode === "ja"
            ? [{ text: cols[0].title, fs: titleFs }]
            : captionTitleMode === "en"
              ? [{ text: cols[1].title, fs: titleFs }]
              : captionTitleMode === "groupV" || captionTitleMode === "groupH"
                ? [{ text: cols[0].title, fs: titleFs }, { text: cols[1].title, fs: titleFsSmall }]
                : [];
        const sharedRow = captionTitleMode === "groupH" && both;
        // 横一列(groupH)は1行前提のレイアウトなので改行を畳む。縦積みは改行を維持。
        if (sharedRow) for (const p of sharedParts) p.text = oneLineName(p.text);
        const colHasTitle = !both || captionTitleMode === "each";
        const capGap = Math.round(bodyFs * 0.7);
        const rowGap = capGap;
        const tagFs = Math.round(bodyFs * 0.82);
        const tagPadX = Math.round(tagFs * 0.5);
        const tagPillH = tagFs + Math.round(tagFs * 0.32) * 2;
        const tagPillGap = Math.round(tagFs * 0.38);
        const tagRadius = Math.round(tagPillH / 2);
        const tagFont = `600 ${tagFs}px ${ffBody}`;
        type PillRow = { t: string; w: number }[];
        const layoutPills = (chips: string[], maxW: number): PillRow[] => {
          ctx.font = tagFont;
          setLS(0); // タグ（ピル）は字間調整の対象外
          const rows: PillRow[] = [];
          let cur: PillRow = [];
          let curW = 0;
          for (const t of chips) {
            const w = Math.ceil(ctx.measureText(t).width) + tagPadX * 2;
            if (cur.length && curW + tagPillGap + w > maxW) { rows.push(cur); cur = []; curW = 0; }
            if (cur.length) curW += tagPillGap;
            cur.push({ t, w });
            curW += w;
          }
          if (cur.length) rows.push(cur);
          return rows;
        };
        const pillsH = (rows: PillRow[]) => (rows.length ? rows.length * tagPillH + (rows.length - 1) * tagPillGap : 0);
        const drawPills = (rows: PillRow[], x: number, top: number) => {
          if (!rows.length) return;
          ctx.save();
          ctx.shadowColor = "transparent";
          setLS(0);
          const { bg, fg } = pillColors();
          let yy = top;
          for (const row of rows) {
            let xx = x;
            for (const { t, w } of row) {
              ctx.fillStyle = bg;
              ctx.beginPath();
              ctx.roundRect(xx, yy, w, tagPillH, tagRadius);
              ctx.fill();
              ctx.fillStyle = fg;
              ctx.font = tagFont;
              ctx.textBaseline = "middle";
              ctx.fillText(t, xx + tagPadX, yy + tagPillH / 2);
              xx += w + tagPillGap;
            }
            yy += tagPillH + tagPillGap;
          }
          ctx.textBaseline = "alphabetic";
          ctx.restore();
        };
        const tagLang: "ja" | "en" = captionLang === "en" ? "en" : "ja";
        const colTagRows = cols.map((_c, ci) => (colHasTitle && !both ? layoutPills(capChips(cap, tagLang), colWidths[ci]) : []));
        const colTagH = colTagRows.map((rows) => (rows.length ? capGap + pillsH(rows) + capGap : 0));
        const sharedTagRows = sharedParts.length ? layoutPills(capChips(cap, tagLang), blockW) : [];
        const colBodyH = wrapped.map((w, ci) => (colHasTitle ? titleLineH * w.title.split("\n").length : 0) + colTagH[ci] + w.lines.length * lineH);
        const sharedTitleH = sharedParts.length
          ? sharedRow
            ? lineHFor(Math.max(...sharedParts.map((p) => p.fs)))
            : sharedParts.reduce((a, p) => a + lineHFor(p.fs) * p.text.split("\n").length, 0)
          : 0;
        const sharedGap = Math.round(bodyFs * 1.0);
        const sharedBelow = !sharedParts.length ? 0 : sharedTagRows.length ? capGap + pillsH(sharedTagRows) + capGap : sharedGap;
        const bodyBlockH =
          sharedTitleH +
          sharedBelow +
          (vertical ? colBodyH.reduce((a, b) => a + b, 0) + rowGap * (cols.length - 1) : Math.max(...colBodyH));
        const blockH = bodyBlockH;
        const bx = Math.min(Math.max(0, Math.round(pfx(captionPos.u))), Math.max(0, OW - blockW));
        const by = Math.min(Math.max(0, Math.round(pfy(captionPos.v))), Math.max(0, OH - blockH));
        if (captionBg !== "none") {
          const px = Math.round(L * 0.018), py = Math.round(L * 0.015);
          drawPanel(bx - px, by - py, blockW + px * 2, bodyBlockH + py * 2, Math.round(L * 0.016), panelRgba(captionPanelColor, captionPanelOpacity));
        }
        ctx.save();
        if (captionShadow) {
          ctx.shadowColor = contrastShadow(captionColor, 0.85);
          ctx.shadowBlur = Math.round(L * 0.004);
          ctx.shadowOffsetY = Math.max(1, Math.round(L * 0.001));
        }
        const drawCol = (ci: number, cxp: number, top: number) => {
          const w = wrapped[ci];
          let ty2 = top;
          ctx.fillStyle = captionColor;
          if (colHasTitle) {
            ctx.font = `${fwCapTitle} ${titleFs}px ${ffTitle}`;
            setLS(titleFs * captionLetterSpace);
            for (const tl of w.title.split("\n")) {
              ctx.fillText(tl, cxp, ty2 + titleFs);
              ty2 += titleLineH;
            }
          }
          if (colHasTitle && colTagRows[ci].length) {
            ty2 += capGap;
            drawPills(colTagRows[ci], cxp, ty2);
            ty2 += pillsH(colTagRows[ci]) + capGap;
          }
          ctx.fillStyle = captionColor;
          ctx.font = `${fwCapBody} ${bodyFs}px ${ffBody}`;
          setLS(bodyFs * captionLetterSpace);
          for (const ln of w.lines) { ctx.fillText(ln, cxp, ty2 + bodyFs); ty2 += lineH; }
        };
        let ty = by;
        if (sharedParts.length) {
          ctx.fillStyle = captionColor;
          if (sharedRow) {
            const baseFs = Math.max(...sharedParts.map((p) => p.fs));
            const baseline = ty + baseFs;
            const gap = Math.round(baseFs * 0.32);
            let cxp = bx;
            sharedParts.forEach((p, pi) => {
              if (pi > 0) {
                ctx.font = `${fwCapTitle} ${baseFs}px ${ffTitle}`;
                setLS(baseFs * captionLetterSpace);
                cxp += gap;
                ctx.globalAlpha = 0.7;
                ctx.fillText("/", cxp, baseline);
                ctx.globalAlpha = 1;
                cxp += ctx.measureText("/").width + gap;
              }
              ctx.font = `${fwCapTitle} ${p.fs}px ${ffTitle}`;
              setLS(p.fs * captionLetterSpace);
              ctx.fillText(p.text, cxp, baseline);
              cxp += ctx.measureText(p.text).width;
            });
            ty += lineHFor(baseFs);
          } else {
            for (const p of sharedParts) {
              ctx.font = `${fwCapTitle} ${p.fs}px ${ffTitle}`;
              setLS(p.fs * captionLetterSpace);
              for (const tl of p.text.split("\n")) {
                ctx.fillText(tl, bx, ty + p.fs);
                ty += lineHFor(p.fs);
              }
            }
          }
          if (sharedTagRows.length) {
            ty += capGap;
            drawPills(sharedTagRows, bx, ty);
            ty += pillsH(sharedTagRows) + capGap;
          } else {
            ty += sharedGap;
          }
        }
        if (vertical) {
          wrapped.forEach((_w, ci) => {
            if (ci > 0) ty += rowGap;
            drawCol(ci, bx, ty);
            ty += colBodyH[ci];
          });
        } else {
          const top = ty;
          wrapped.forEach((_w, ci) => {
            drawCol(ci, bx + (ci === 0 ? 0 : colWidths[0] + colGap), top);
          });
        }
        ctx.restore();
      }
    }

    // センタータイトル（ポスター風）。すべての上に、中央寄せの3段で描く。
    {
      const tp = titleParts();
      if (titleOn && tp) {
        const cx = pfx(titlePos.u);
        const cy = pfy(titlePos.v);
        const ffTitle = roleFontStack(titleFont);
        const p = FONT_PAIRS[titleFont];
        const fwTitleMain = pairWeightPx(titleFont, "title", titleWeight);
        const fwTitleSub = titleSubWeightPx(fwTitleMain);
        await Promise.all([
          document.fonts.load(`${fwTitleMain} 16px "${p.jp}"`).catch(() => {}),
          document.fonts.load(`${fwTitleMain} 16px "${p.en}"`).catch(() => {}),
          document.fonts.load(`${fwTitleSub} 16px "${p.jp}"`).catch(() => {}),
          document.fonts.load(`${fwTitleSub} 16px "${p.en}"`).catch(() => {}),
        ]);
        const mainFs = Math.round(L * 0.075 * titleScale);
        const overFs = Math.max(1, Math.round(mainFs * 0.26 * titleSideScale));
        const numFs = Math.max(1, Math.round(mainFs * 0.3 * titleSideScale));
        const overGap = Math.round(mainFs * 0.42 * titleLineHeight);
        const numGap = Math.round(mainFs * 0.34 * titleLineHeight);
        let mainLines = tp.main.split("\n");
        {
          ctx.font = `${fwTitleMain} ${mainFs}px ${ffTitle}`;
          setLS(mainFs * 0.04 * titleLetterSpace);
          const maxW = (titleW ?? 0.98) * OW;
          const wrapLine = (text: string): string[] => {
            const out: string[] = [];
            let cur = "";
            for (const ch of text) {
              if (cur && ctx.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; }
              else cur += ch;
            }
            if (cur) out.push(cur);
            return out.length ? out : [""];
          };
          mainLines = mainLines.flatMap(wrapLine);
        }
        const mainLineH = Math.round(mainFs * 1.02); // プレビュー .ar-title-main の line-height と一致
        const mainBlockH = mainFs + (mainLines.length - 1) * mainLineH;
        const totalH = (tp.over ? overFs + overGap : 0) + mainBlockH + (tp.num ? numGap + numFs : 0);
        // 擬似細字（実験・題字のみ）: 1ウェイト書体で「細い」を選んだときは、
        // いったん透明レイヤーへ描き、輪郭を内側に削って（エロージョン）から本紙へ合成する。
        // プレビュー側は SVG の feMorphology(erode) で同じ半径をかけており、見た目が一致する。
        const erodeR = Math.max(0, Math.round(pairSynthLight(titleFont, titleWeight) * mainFs));
        const tcv = erodeR > 0 ? document.createElement("canvas") : null;
        if (tcv) { tcv.width = canvas.width; tcv.height = canvas.height; }
        const tctx = tcv ? tcv.getContext("2d")! : ctx;
        if (tcv) tctx.setTransform(ctx.getTransform());
        const setTLS = (px: number) => {
          (tctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${px}px`;
        };
        // 小見出し・標高は小さくエロージョンに弱いため本紙(ctx)に直接描き、主行だけレイヤーで削る
        const applyTitleStyle = (c: CanvasRenderingContext2D) => {
          c.textAlign = "center";
          c.textBaseline = "top";
          c.fillStyle = titleColor;
          if (titleShadow) {
            c.shadowColor = contrastShadow(titleColor);
            c.shadowBlur = Math.round(L * 0.006);
            c.shadowOffsetY = Math.max(1, Math.round(L * 0.0015));
          }
        };
        let y = cy - totalH / 2;
        ctx.save();
        applyTitleStyle(ctx);
        if (tcv) {
          tctx.save();
          applyTitleStyle(tctx);
        }
        if (tp.over) {
          ctx.font = `${fwTitleSub} ${overFs}px ${ffTitle}`;
          setLS(overFs * 0.35 * titleLetterSpace);
          ctx.fillText(tp.over, cx, y);
          y += overFs + overGap;
        }
        tctx.font = `${fwTitleMain} ${mainFs}px ${ffTitle}`;
        setTLS(mainFs * 0.04 * titleLetterSpace);
        for (let li = 0; li < mainLines.length; li++) {
          tctx.fillText(mainLines[li], cx, y + li * mainLineH);
        }
        y += mainBlockH;
        if (tp.num) {
          y += numGap;
          ctx.font = `${fwTitleSub} ${numFs}px ${ffTitle}`;
          setLS(numFs * 0.3 * titleLetterSpace);
          ctx.fillText(tp.num, cx, y);
        }
        setLS(0);
        setTLS(0);
        if (tcv) tctx.restore();
        ctx.restore();
        if (tcv) {
          // エロージョン: 元画像を r ずらした8方向と destination-in で交差させ、内側だけ残す
          const pristine = document.createElement("canvas");
          pristine.width = tcv.width;
          pristine.height = tcv.height;
          pristine.getContext("2d")!.drawImage(tcv, 0, 0);
          tctx.save();
          tctx.setTransform(1, 0, 0, 1, 0, 0);
          tctx.globalCompositeOperation = "destination-in";
          const dd = Math.max(1, Math.round(erodeR * 0.7071));
          for (const [dx, dy] of [[erodeR, 0], [-erodeR, 0], [0, erodeR], [0, -erodeR], [dd, dd], [dd, -dd], [-dd, dd], [-dd, -dd]] as const) {
            tctx.drawImage(pristine, dx, dy);
          }
          tctx.restore();
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(tcv, 0, 0);
          ctx.restore();
        }
      }
    }
    // 記録の帯（外側フレーム下部の中央に2行。camera=Shot on 表記 / free=自由入力）。
    if (exifOn && nBand > 0) {
      const ink = noteInkColors();
      const noteFF = roleFontStack(noteFont);
      const mainFs = Math.round(L * 0.019);
      const subFs = Math.round(L * 0.014);
      const cy = OH + nBand / 2; // translate 済み座標: 内側コンテンツの直下が帯
      const gap = Math.round(mainFs * 0.8);
      ctx.save();
      ctx.textBaseline = "middle";
      if (noteMode === "camera") {
        const segs: Array<{ text: string; font: string; color: string }> = [];
        if (exifModel || exifMaker) {
          segs.push({ text: "Shot on ", font: `500 ${mainFs}px ${noteFF}`, color: ink.sub });
          if (exifModel) segs.push({ text: `${exifModel} `, font: `700 ${mainFs}px ${noteFF}`, color: ink.main });
          if (exifMaker) segs.push({ text: exifMaker, font: `500 ${mainFs}px ${noteFF}`, color: ink.sub });
        }
        const both = segs.length > 0 && !!exifSpec;
        if (segs.length > 0) {
          // 部分ごとに太さ・色が違うため、全体幅を測ってから左詰めで中央揃えに描く。
          setLS(mainFs * 0.01); // プレビュー(.ar-exif-model の letter-spacing: 0.01em)と揃える
          let total = 0;
          for (const s of segs) {
            ctx.font = s.font;
            total += ctx.measureText(s.text).width;
          }
          let x = OW / 2 - total / 2;
          ctx.textAlign = "left";
          for (const s of segs) {
            ctx.font = s.font;
            ctx.fillStyle = s.color;
            ctx.fillText(s.text, x, both ? cy - gap : cy);
            x += ctx.measureText(s.text).width;
          }
        }
        if (exifSpec) {
          ctx.textAlign = "center";
          ctx.font = `500 ${subFs}px ${noteFF}`;
          setLS(subFs * 0.04); // プレビュー(.ar-exif-spec の letter-spacing: 0.04em)と揃える
          ctx.fillStyle = ink.sub;
          ctx.fillText(exifSpec, OW / 2, both ? cy + gap : cy);
        }
      } else {
        const ff = noteFF;
        const both = !!noteLine1 && !!noteLine2;
        ctx.textAlign = "center";
        if (noteLine1) {
          ctx.font = `${noteL1.italic ? "italic " : ""}${noteL1.bold ? 700 : 600} ${mainFs}px ${ff}`;
          setLS(mainFs * 0.03); // プレビュー(.ar-exif-l1 の letter-spacing: 0.03em)と揃える
          ctx.fillStyle = noteL1.dim ? ink.sub : ink.main;
          ctx.fillText(noteLine1, OW / 2, both ? cy - gap : cy);
        }
        if (noteLine2) {
          const fs2 = Math.round(L * 0.016);
          ctx.font = `${noteL2.italic ? "italic " : ""}${noteL2.bold ? 600 : 400} ${fs2}px ${ff}`;
          setLS(fs2 * 0.03); // プレビュー(.ar-exif-l2 の letter-spacing: 0.03em)と揃える
          ctx.fillStyle = noteL2.dim ? ink.sub : ink.main;
          ctx.fillText(noteLine2, OW / 2, both ? cy + gap : cy);
        }
      }
      ctx.restore();
    }
    return canvasToJpegBlob(canvas, 0.92);
  };

  // 書き出しの入口。失敗（例外・空Blob・写真の未描画）したら出力上限を段階的に下げて
  // 再試行する。結果は「成功（どの上限で焼けたか）」か「失敗（原因の種類）」で返し、
  // 呼び出し側がユーザーへの案内文を出し分ける。
  const EXPORT_CAPS = [4096, 2560, 1600];
  type BakeResult = { blob: Blob; cap: number } | { blob: null; error: "load" | "memory" };
  const bakeExport = async (): Promise<BakeResult> => {
    let img: HTMLImageElement;
    try {
      img = await loadImage(photoUrl);
    } catch {
      return { blob: null, error: "load" };
    }
    for (const cap of EXPORT_CAPS) {
      try {
        const blob = await bakeComposite(img, cap);
        if (blob) return { blob, cap };
      } catch {
        /* 次のサイズで再試行 */
      }
    }
    return { blob: null, error: "memory" };
  };

  // テンプレートの値束を各 state に一括反映し、編集画面へ。
  const applyTemplate = (t: ExportTemplate) => {
    const ar = photoNat ? photoNat.w / photoNat.h : 1;
    const s = orientStyle(t, ar < 1);
    setBakeLabels(s.bakeLabels);
    setLabelMode(s.labelMode);
    setLabelBg(s.labelBg);
    setLabelPanelColor(s.labelPanelColor);
    setLabelPanelOpacity(s.labelPanelOpacity);
    setLabelColor(s.labelColor);
    setLabelShadow(s.labelShadow);
    setLabelLineOn(s.labelLineOn);
    setLabelLineColor(s.labelLineColor);
    setLabelNameScale(s.labelNameScale);
    setLabelSubScale(s.labelSubScale);
    setLabelLetterSpace(s.labelLetterSpace);
    setLabelLineHeight(s.labelLineHeight);
    setCaptionLang(s.captionLang);
    setCaptionLayout(s.captionLayout);
    setCaptionTitleMode(s.captionTitleMode);
    setCaptionLength(s.captionLength);
    setCaptionBg(s.captionBg);
    setCaptionPanelColor(s.captionPanelColor);
    setCaptionPanelOpacity(s.captionPanelOpacity);
    setCaptionColor(s.captionColor);
    setCaptionShadow(s.captionShadow);
    setCaptionTitleScale(s.captionTitleScale);
    setCaptionBodyScale(s.captionBodyScale);
    setCaptionLetterSpace(s.captionLetterSpace);
    setCaptionLineHeight(s.captionLineHeight);
    setCaptionPos(s.captionPos);
    setCaptionW(s.captionW);
    setCaptionSplit(s.captionSplit);
    setTagColor(s.tagColor);
    setTagColorTarget(s.tagColorTarget);
    setCapShowElev(s.capShowElev);
    setCapShowLoc(s.capShowLoc);
    setCapSelectedTags(s.capSelectedTags);
    setTitleOn(s.titleOn);
    setTitleLang(s.titleLang);
    setTitleShowOver(s.titleShowOver);
    setTitleShowNum(s.titleShowNum);
    setTitleScale(s.titleScale);
    setTitleSideScale(s.titleSideScale ?? 1);
    setTitleW(s.titleW);
    setTitleColor(s.titleColor);
    setTitleShadow(s.titleShadow);
    setTitleFont(s.titleFont);
    setTitleWeight(s.titleWeight);
    setTitleLetterSpace(s.titleLetterSpace);
    setTitleLineHeight(s.titleLineHeight);
    setTitlePos(s.titlePos);
    setRoleFonts(s.roleFonts);
    setRoleWeights(s.roleWeights);
    setFrameMargin(s.frameMargin);
    setFrameMarginColor(s.frameMarginColor);
    setFrameMarginAuto(s.frameMarginAuto);
    setCropInset(s.cropInset);
    setFrameFade(s.frameFade);
    setActiveTemplateId(t.id);
    // テンプレが使う最初の機能のタブを開く（例: 頂ならタイトル）。
    setPanelTab(templateTabs(t.style)[0] ?? "label");
    setExportView("edit");
    setEverEdited(true);
  };

  // カルーセルで選んだテーマを適用（素=テーマなしはそのまま編集へ）。
  const chooseTpl = (it: TplItem) => {
    if (it.tpl) {
      applyTemplate(it.tpl);
    } else {
      setExportView("edit");
      setEverEdited(true);
    }
  };
  // スワイプ表示に入ったら、現在のテーマ位置までスクロールを合わせる（PC⇔スマホ切替時のずれ防止）。
  useEffect(() => {
    if (!isNarrow || exportView !== "template") return;
    const el = tplSwipeRef.current;
    const slide = el?.firstElementChild as HTMLElement | null;
    if (!el || !slide) return;
    // tplIdx は同期の起点としてだけ読む（スクロール操作のたびに巻き戻さないよう依存に含めない）
    el.scrollLeft = tplIdx * (slide.offsetWidth + 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNarrow, exportView]);

  // スマホのスワイプ位置 → ドット表示用の現在位置。
  const onTplScroll = () => {
    const el = tplSwipeRef.current;
    const slide = el?.firstElementChild as HTMLElement | null;
    if (!el || !slide) return;
    const w = slide.offsetWidth + 2; // 2 = gap
    setTplIdx(Math.max(0, Math.min(TPL_ITEMS.length - 1, Math.round(el.scrollLeft / w))));
  };

  // PCカバーフローのスワイプ。ドラッグ中は100pxごとに1枚送り、短いフリックでも1枚動かす。
  // 8px以上動いたらポインタをキャプチャ（＝カードの click は発火しなくなる）。
  const stepTpl = (delta: number) =>
    setTplIdx((i) => Math.max(0, Math.min(TPL_ITEMS.length - 1, i + delta)));
  const onFlowPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    flowDragRef.current = { id: e.pointerId, startX: e.clientX, lastX: e.clientX, steps: 0, moved: false };
  };
  const onFlowPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = flowDragRef.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientX - d.startX) > 8) {
      d.moved = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* 古いブラウザで未対応でもドラッグ自体は動く */
      }
    }
    const dx = e.clientX - d.lastX;
    if (Math.abs(dx) >= 100) {
      stepTpl(dx < 0 ? 1 : -1); // 左へ払う＝次のテーマ
      d.steps++;
      d.lastX = e.clientX;
    }
  };
  const onFlowPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = flowDragRef.current;
    flowDragRef.current = null;
    if (!d || d.id !== e.pointerId || !d.moved) return;
    // ドラッグ中に1枚も送っていない短いフリックは1枚だけ動かす。
    const dxTotal = e.clientX - d.startX;
    if (d.steps === 0 && Math.abs(dxTotal) > 30) stepTpl(dxTotal < 0 ? 1 : -1);
    // キャプチャ外のブラウザ差異に備えて、直後の click は無視する。
    flowSuppressClick.current = true;
    window.setTimeout(() => {
      flowSuppressClick.current = false;
    }, 0);
  };

  // 現在の仕上げ設定（ExportStyle）。設定の書き出しと一覧へ戻るときの状態保存に使う。
  const currentStyle = (): ExportStyle => ({
    bakeLabels, labelMode, labelBg, labelPanelColor, labelPanelOpacity, labelColor, labelShadow, labelLineOn, labelLineColor,
    labelNameScale, labelSubScale, labelLetterSpace, labelLineHeight,
    captionLang, captionLayout, captionTitleMode, captionLength, captionBg, captionPanelColor, captionPanelOpacity, captionColor, captionShadow,
    captionTitleScale, captionBodyScale, captionLetterSpace, captionLineHeight, captionPos, captionW, captionSplit,
    tagColor, tagColorTarget, capShowElev, capShowLoc, capSelectedTags,
    titleOn, titleLang, titleShowOver, titleShowNum, titleScale, titleSideScale, titleW, titleColor, titleShadow, titleFont, titleLetterSpace, titleLineHeight, titlePos, titleWeight,
    roleFonts, roleWeights, frameMargin, frameMarginColor, frameMarginAuto, cropInset, frameFade,
  });

  // 一覧へ渡す編集状態。一度も編集に入っていなければ null。
  // テーマ選択へ「戻った」だけの状態でも、編集済みの内容は保存する。
  const makeSnapshot = (): StudioSnapshot | null =>
    everEdited
      ? {
          style: currentStyle(),
          templateId: activeTemplateId,
          labels: arLabels,
          captionIdx,
          exif: {
            on: exifOn,
            model: exifModel,
            maker: exifMaker,
            spec: exifSpec,
            mode: noteMode,
            line1: noteLine1,
            line2: noteLine2,
            font: noteFont,
            bg: noteBg,
            band: noteBand,
            l1: noteL1,
            l2: noteL2,
            inkAuto: noteInkAuto,
            ink: noteInk,
          },
        }
      : null;

  // プレビューは Blob の objectURL で表示（巨大な dataURL を state に持つとスマホで
  // メモリを圧迫しクラッシュの原因になる）。差し替え・クローズ・離脱時に revoke する。
  useEffect(() => {
    const url = previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [previewUrl]);

  const openExportPreview = async () => {
    if (previewBaking) return;
    setPreviewBaking(true);
    setExportNotice(null);
    try {
      const r = await bakeExport();
      if (r.blob) {
        setPreviewBlob(r.blob);
        setPreviewUrl(URL.createObjectURL(r.blob));
        // 最大解像度で焼けなかったときは、黙って出さずに理由と対処を知らせる。
        if (r.cap < EXPORT_CAPS[0]) {
          setExportNotice({
            kind: "warn",
            text: t("studio.export.lowMemory", { cap: r.cap }),
          });
        }
      } else if (r.error === "load") {
        setExportNotice({
          kind: "error",
          text: t("studio.export.loadFailed"),
        });
      } else {
        setExportNotice({
          kind: "error",
          text: t("studio.export.bakeFailed"),
        });
      }
    } finally {
      setPreviewBaking(false);
    }
  };
  // プレビューを閉じたら Blob も破棄する（「保存」で使うのは表示中だけ。閉じた後まで
  // フル解像度JPEGを持ち続けない。次回のプレビューで焼き直す）。
  const closePreview = () => {
    setPreviewUrl(null);
    setPreviewBlob(null);
  };

  // 一覧へ戻る。編集状態は snapshot（JSONデータ）だけで保存し、画像の焼き込みは
  // 行わない。Canvas の生成はプレビュー・保存の時だけに絞る（スマホのメモリ対策）。
  const exitToBoard = () => onExit(makeSnapshot(), savedOnce);
  // 保存。モバイルは Web Share API（「"写真"に保存」）優先、PC は直接ダウンロード。
  // ブラウザ差異の吸収は lib/exportImage.ts の saveBlob に集約。
  // 成功したら「保存済み」として記録し、一覧の状態表示に使う。
  const [savedOnce, setSavedOnce] = useState(false);
  const saveExportImage = async () => {
    if (!previewBlob) return;
    const outcome = await saveBlob(previewBlob, "frame.jpg");
    if (outcome === "shared" || outcome === "downloaded") setSavedOnce(true);
    if (outcome === "failed")
      setExportNotice({ kind: "error", text: t("studio.export.saveFailed") });
  };

  // ============================ ドラッグ（編集） ============================ //
  const onEditDown = (i: number, kind: "dot" | "label" | "labelAnchor") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    arDragRef.current = { i, kind };
  };
  const onCaptionDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const stage = arFrameRef.current;
    if (stage) {
      const r = stage.getBoundingClientRect();
      const b = (e.currentTarget as Element).getBoundingClientRect();
      const pu = (e.clientX - r.left) / r.width;
      const pv = (e.clientY - r.top) / r.height;
      const cf = photoToFrame(captionPos.u, captionPos.v);
      captionDragRef.current = { offU: pu - cf.u, offV: pv - cf.v, h: b.height / r.height };
    }
    arDragRef.current = { i: -1, kind: "caption" };
  };
  const onTitleDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const stage = arFrameRef.current;
    if (stage) {
      const r = stage.getBoundingClientRect();
      const b = (e.currentTarget as Element).getBoundingClientRect();
      const pu = (e.clientX - r.left) / r.width;
      const pv = (e.clientY - r.top) / r.height;
      const tf = photoToFrame(titlePos.u, titlePos.v);
      titleDragRef.current = { offU: pu - tf.u, offV: pv - tf.v, w: b.width / r.width, h: b.height / r.height };
    }
    arDragRef.current = { i: -1, kind: "title" };
  };
  const onCapResizeDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture?.(e.pointerId);
    const cl = el.classList;
    const side: "l" | "r" | "t" | "b" = cl.contains("ar-cap-handle--l")
      ? "l"
      : cl.contains("ar-cap-handle--t")
        ? "t"
        : cl.contains("ar-cap-handle--b")
          ? "b"
          : "r";
    const r = arFrameRef.current?.getBoundingClientRect();
    const cf = photoToFrame(captionPos.u, captionPos.v);
    capResizeRef.current = {
      side,
      startW: captionW,
      startV: r ? (e.clientY - r.top) / r.height : 0,
      boxLeft: cf.u,
      boxRight: cf.u + captionW,
    };
    arDragRef.current = { i: -1, kind: "capResize" };
  };
  const onLabelResizeDown = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const lb = arLabels[i];
    labelResizeRef.current = { cu: photoToFrame(lb.labelU, lb.labelV).u };
    arDragRef.current = { i, kind: "labelResize" };
  };
  const onTitleResizeDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    titleResizeRef.current = { cu: photoToFrame(titlePos.u, titlePos.v).u };
    arDragRef.current = { i: -1, kind: "titleResize" };
  };
  const onCapSplitDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    arDragRef.current = { i: -1, kind: "capSplit" };
  };
  const onEditMove = (e: React.PointerEvent) => {
    const d = arDragRef.current;
    const stage = arFrameRef.current;
    if (!d || !stage) return;
    // ボタンを離したまま move が来たら（up の取りこぼし）ドラッグを終了する。
    if (e.pointerType === "mouse" && e.buttons === 0) {
      arDragRef.current = null;
      setSnapGuide({ x: null, y: null });
      return;
    }
    const r = stage.getBoundingClientRect();
    const u = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    if (d.kind === "caption") {
      const off = captionDragRef.current ?? { offU: 0, offV: 0, h: 0 };
      const maxU = Math.max(0, 1 - captionW);
      // 左端・中央・右端／上端・中央・下端でスナップ（ブロックは左上アンカー）。
      const sx = snapAxis(u - off.offU, [0, captionW / 2, captionW]);
      const sy = snapAxis(v - off.offV, off.h > 0 ? [0, off.h / 2, off.h] : [0]);
      const fU = Math.min(maxU, Math.max(0, sx.pos));
      const fV = Math.min(0.82, Math.max(0, sy.pos));
      setSnapGuide({ x: fU === sx.pos ? sx.line : null, y: fV === sy.pos ? sy.line : null });
      setCaptionPos(frameToPhoto(fU, fV));
      return;
    }
    if (d.kind === "title") {
      const off = titleDragRef.current ?? { offU: 0, offV: 0, w: 0, h: 0 };
      // 中央アンカーなので、左右端・中央・上下端の候補は ±サイズ/2 のオフセット。
      const sx = snapAxis(u - off.offU, off.w > 0 ? [-off.w / 2, 0, off.w / 2] : [0]);
      const sy = snapAxis(v - off.offV, off.h > 0 ? [-off.h / 2, 0, off.h / 2] : [0]);
      const fU = Math.min(1, Math.max(0, sx.pos));
      const fV = Math.min(1, Math.max(0, sy.pos));
      setSnapGuide({ x: sx.line, y: sy.line });
      setTitlePos(frameToPhoto(fU, fV));
      return;
    }
    if (d.kind === "titleResize") {
      const rz = titleResizeRef.current;
      if (!rz) return;
      // 題字は中央アンカー。幅＝中心からドラッグ位置までの距離×2。
      setTitleW(Math.min(0.98, Math.max(0.1, Math.abs(u - rz.cu) * 2)));
      return;
    }
    if (d.kind === "labelResize") {
      const rz = labelResizeRef.current;
      if (!rz) return;
      // 名札は中央アンカーなので、幅＝中心からドラッグ位置までの距離×2。
      // 文字サイズは変えず、折り返し幅（labelW）だけを更新する。
      const w = Math.min(0.98, Math.max(0.06, Math.abs(u - rz.cu) * 2));
      setArLabels((prev) => prev.map((l, idx) => (idx !== d.i ? l : { ...l, labelW: w })));
      return;
    }
    if (d.kind === "capResize") {
      const rz = capResizeRef.current;
      if (!rz) return;
      const MINW = 0.22;
      if (rz.side === "r") {
        setCaptionW(Math.min(1 - rz.boxLeft, Math.max(MINW, u - rz.boxLeft)));
      } else if (rz.side === "l") {
        const newLeft = Math.min(rz.boxRight - MINW, Math.max(0, u));
        setCaptionPos((p) => ({ ...p, u: frameToPhoto(newLeft, 0).u }));
        setCaptionW(rz.boxRight - newLeft);
      } else if (rz.side === "b") {
        setCaptionW(Math.min(1 - rz.boxLeft, Math.max(MINW, rz.startW - (v - rz.startV) * 1.4)));
      } else {
        const newTop = Math.min(0.9, Math.max(0, v));
        setCaptionPos((p) => ({ ...p, v: frameToPhoto(0, newTop).v }));
        setCaptionW(Math.min(1 - rz.boxLeft, Math.max(MINW, rz.startW - (rz.startV - v) * 1.4)));
      }
      return;
    }
    if (d.kind === "capSplit") {
      const cfu = photoToFrame(captionPos.u, captionPos.v).u;
      setCaptionSplit(Math.min(0.8, Math.max(0.2, (u - cfu) / Math.max(0.001, captionW))));
      return;
    }
    if (d.kind === "labelAnchor") {
      const lb = arLabels[d.i];
      const box = labelBoxes[d.i] ?? { w: 0, h: 0 };
      const c = photoToFrame(lb.labelU, lb.labelV);
      const cxn = c.u;
      const cyn = c.v - box.h / 2;
      const dx = (u - cxn) / Math.max(1e-4, box.w / 2);
      const dy = (v - cyn) / Math.max(1e-4, box.h / 2);
      const side = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "top" : "bottom";
      setArLabels((prev) => prev.map((l, idx) => (idx !== d.i ? l : { ...l, labelAnchor: side })));
      return;
    }
    if (d.kind === "label") {
      // 名札は中央下アンカー。左右端・中央・上下端でスナップ。
      const box = labelBoxes[d.i] ?? { w: 0, h: 0 };
      const sx = snapAxis(u, box.w > 0 ? [-box.w / 2, 0, box.w / 2] : [0]);
      const sy = snapAxis(v, box.h > 0 ? [-box.h, -box.h / 2, 0] : [0]);
      setSnapGuide({ x: sx.line, y: sy.line });
      const p = frameToPhoto(sx.pos, sy.pos);
      setArLabels((prev) => prev.map((lb, idx) => (idx !== d.i ? lb : { ...lb, labelU: p.u, labelV: p.v })));
      return;
    }
    const p = frameToPhoto(u, v);
    setArLabels((prev) => prev.map((lb, idx) => (idx !== d.i ? lb : { ...lb, dotU: p.u, dotV: p.v })));
  };
  const onEditUp = () => {
    arDragRef.current = null;
    setSnapGuide({ x: null, y: null });
  };

  // ============================ 描画 ============================ //
  const capItemTags = capItem?.tagsJa ?? [];
  // タブの点灯ドット用: フレーム加工（余白/切り抜き/ふち）が効いているか。
  const frameActive =
    fAnyMargin || frameFade > 0 || cropInset.l > 0 || cropInset.t > 0 || cropInset.r > 0 || cropInset.b > 0;
  const activeTemplate = EXPORT_TEMPLATES.find((t) => t.id === activeTemplateId) ?? null;
  // タブの点灯状態と、シンプルモードで見せるタブ（テンプレが使う機能＋現在有効な機能）。
  const tabOn: Record<PanelTab, boolean> = {
    label: bakeLabels,
    caption: captionLang !== "none",
    title: titleOn,
    frame: frameActive,
    note: exifOn,
  };
  const relevantTabs = activeTemplate ? templateTabs(activeTemplate.style) : PANEL_TABS;
  // 「記録」はテンプレに依存しない機能なので、シンプルモードでも常に見せる。
  const visibleTabs =
    panelMode === "simple" ? PANEL_TABS.filter((t) => relevantTabs.includes(t) || tabOn[t] || t === "note") : PANEL_TABS;
  const changePanelMode = (m: "simple" | "full") => {
    setPanelMode(m);
    try {
      localStorage.setItem(PANEL_MODE_KEY, m);
    } catch {
      /* 保存できなくても動作に支障なし */
    }
    if (m === "simple") {
      const simple = PANEL_TABS.filter((t) => relevantTabs.includes(t) || tabOn[t] || t === "note");
      if (!simple.includes(panelTab)) setPanelTab(simple[0] ?? "label");
    }
  };
  // 山の情報（名前・英語名・標高）の編集ブロック。名前は名札・解説見出し・タイトルの
  // すべてに効くため、山名・解説・タイトルの各タブ先頭に共通で出す（テンプレによって
  // シンプルモードで見えるタブが違っても、必ずどこかから編集できるように）。
  const dataEdit = (
    <div className="studio-data-edit">
      <span className="studio-data-head">{t("studio.data.heading")}</span>
      {arLabels.map((lb, i) => (
        <div key={lb.id} className="studio-data-row">
          {/* 山名は改行可（Enterで改行）。改行は写真上の名札にそのまま反映される。 */}
          <textarea
            className="studio-data-input studio-data-input--name"
            value={lb.name}
            rows={Math.max(1, lb.name.split("\n").length)}
            onChange={(e) => setLabelName(i, e.target.value)}
            placeholder={t("studio.data.namePlaceholder")}
            aria-label={t("studio.data.nameLabel", { n: i + 1 })}
            autoComplete="off"
          />
          {/* 英語名も改行可（Enterで改行）。名札の英語表示にそのまま反映される。 */}
          <textarea
            className="studio-data-input studio-data-input--en"
            value={lb.nameEn ?? ""}
            rows={Math.max(1, (lb.nameEn ?? "").split("\n").length)}
            onChange={(e) => setLabelNameEn(i, e.target.value)}
            placeholder={t("studio.data.nameEnPlaceholder")}
            aria-label={t("studio.data.nameEnLabel", { name: oneLineName(lb.name) })}
            autoComplete="off"
          />
          <span className="studio-data-elev">
            <input
              type="number"
              inputMode="numeric"
              className="studio-data-input studio-data-input--elev"
              value={lb.elevM ?? ""}
              onChange={(e) => setLabelElev(i, e.target.value)}
              placeholder={t("studio.data.elevationPlaceholder")}
              aria-label={t("studio.data.elevationLabel", { name: oneLineName(lb.name) })}
            />
            m
          </span>
          <button
            type="button"
            className={`studio-data-eye${lb.hidden ? " is-off" : ""}`}
            onClick={() => setLabelHidden(i, !lb.hidden)}
            title={t("studio.data.showOnPhoto")}
            aria-label={t("studio.data.showOnPhotoLabel", { name: oneLineName(lb.name) })}
            aria-pressed={!lb.hidden}
          >
            {lb.hidden ? <IconEyeOff size={15} /> : <IconEye size={15} />}
          </button>
        </div>
      ))}
    </div>
  );

  // 「取り上げる山」セレクト（解説・タイトルの両タブ先頭に出す）。
  const subjectRow =
    arLabels.length > 1 ? (
      <div className="ar-fs-row">
        <span>{t("studio.data.subject")}</span>
        <div className="ar-font-sel">
          <select value={captionIdx} onChange={(e) => setCaptionIdx(Number(e.target.value))} aria-label={t("studio.data.subject")}>
            {arLabels.map((l, i) => (
              <option key={i} value={i}>{oneLineName(l.name)}</option>
            ))}
          </select>
        </div>
      </div>
    ) : null;

  return (
    <div className="studio">
      {/* テンプレ選択 */}
      {exportView === "template" && (
        <div className="ar-tpl">
          <div className="ar-tpl-inner">
            <header className="ar-tpl-head">
              <p className="kicker">Theme</p>
              <h1>{t("studio.theme.heading")}</h1>
              <p>{isNarrow ? t("studio.theme.subNarrow") : t("studio.theme.subWide")}{t("studio.theme.subTail")}</p>
            </header>

            {isNarrow ? (
              /* スマホ: 画像だけをほぼ全幅で横スワイプ。説明と決定ボタンは下部で共有 */
              <>
                <div className="tpl-swipe" ref={tplSwipeRef} onScroll={onTplScroll}>
                  {TPL_ITEMS.map((it, i) => (
                    <div
                      key={it.id}
                      className="tpl-swipe-slide"
                      onClick={(e) =>
                        i === tplIdx
                          ? chooseTpl(it)
                          : e.currentTarget.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })
                      }
                      role="button"
                      aria-label={i === tplIdx ? t("studio.theme.finishWith", { sub: t(it.sub) }) : t("studio.theme.previewOf", { sub: t(it.sub) })}
                    >
                      {it.tpl ? (
                        <img src={`${import.meta.env.BASE_URL}template-previews/${getAppMode() === "hanabi" ? "hanabi/" : ""}${it.id}.jpg${TPL_PREVIEW_VER}`} alt={t(it.sub)} />
                      ) : (
                        <div className="tpl-card-custom">{t("studio.theme.customCard")}</div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="tpl-dots" aria-hidden="true">
                  {TPL_ITEMS.map((it, i) => (
                    <span key={it.id} className={i === tplIdx ? "is-on" : ""} />
                  ))}
                </div>
                <div className="tpl-swipe-info">
                  <div className="tpl-slide-body">
                    <span className="tpl-kanji" aria-hidden="true">{TPL_ITEMS[tplIdx].name}</span>
                    <div className="tpl-slide-text">
                      <b>{t(TPL_ITEMS[tplIdx].sub)}</b>
                      <p>{t(TPL_ITEMS[tplIdx].hint)}</p>
                    </div>
                  </div>
                  <button type="button" className="ar-btn-main tpl-choose" onClick={() => chooseTpl(TPL_ITEMS[tplIdx])}>
                    {t("studio.theme.chooseThis")}
                  </button>
                </div>
              </>
            ) : (
              /* PC: カバーフロー。中央が正面、左右は奥に傾けて覗かせる */
              <>
                <div className="tpl-flow">
                  <button
                    type="button"
                    className="tpl-flow-nav"
                    onClick={() => setTplIdx((i) => Math.max(0, i - 1))}
                    disabled={tplIdx === 0}
                    aria-label={t("studio.theme.prev")}
                  >
                    ‹
                  </button>
                  <div
                    className="tpl-flow-stage"
                    onPointerDown={onFlowPointerDown}
                    onPointerMove={onFlowPointerMove}
                    onPointerUp={onFlowPointerUp}
                    onPointerCancel={() => (flowDragRef.current = null)}
                  >
                    {TPL_ITEMS.map((it, i) => {
                      const off = i - tplIdx;
                      const abs = Math.abs(off);
                      return (
                        <div
                          key={it.id}
                          className={`tpl-flow-card${off === 0 ? " is-center" : ""}`}
                          style={{
                            transform: `translateY(-50%) translateX(calc(-50% + ${off} * clamp(170px, 24vw, 275px))) translateZ(${off === 0 ? 0 : -220 - abs * 70}px) rotateY(${off === 0 ? 0 : off < 0 ? 48 : -48}deg)`,
                            zIndex: 10 - abs,
                            opacity: abs > 2 ? 0 : 1,
                            pointerEvents: abs > 2 ? "none" : "auto",
                          }}
                          onClick={() => {
                            if (flowSuppressClick.current) return;
                            if (off === 0) chooseTpl(it);
                            else setTplIdx(i);
                          }}
                          role="button"
                          aria-label={off === 0 ? t("studio.theme.finishWith", { sub: t(it.sub) }) : t("studio.theme.previewOf", { sub: t(it.sub) })}
                        >
                          {it.tpl ? (
                            <img src={`${import.meta.env.BASE_URL}template-previews/${getAppMode() === "hanabi" ? "hanabi/" : ""}${it.id}.jpg${TPL_PREVIEW_VER}`} alt="" />
                          ) : (
                            <div className="tpl-card-custom">{t("studio.theme.customCard")}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="tpl-flow-nav"
                    onClick={() => setTplIdx((i) => Math.min(TPL_ITEMS.length - 1, i + 1))}
                    disabled={tplIdx === TPL_ITEMS.length - 1}
                    aria-label={t("studio.theme.next")}
                  >
                    ›
                  </button>
                </div>
                <div className="tpl-flow-info">
                  <div className="tpl-slide-body">
                    <span className="tpl-kanji" aria-hidden="true">{TPL_ITEMS[tplIdx].name}</span>
                    <div className="tpl-slide-text">
                      <b>{t(TPL_ITEMS[tplIdx].sub)}</b>
                      <p>{t(TPL_ITEMS[tplIdx].hint)}</p>
                    </div>
                  </div>
                  <button type="button" className="ar-btn-main tpl-choose" onClick={() => chooseTpl(TPL_ITEMS[tplIdx])}>
                    {t("studio.theme.chooseThis")}
                  </button>
                </div>
              </>
            )}

            <div className="ar-tpl-foot">
              <button className="ar-btn-sub" onClick={() => onExit(makeSnapshot(), savedOnce)}>{t("studio.common.toBoard")}</button>
              <button className="ar-btn-sub" onClick={onReselect}>{t("studio.theme.reselect")}</button>
            </div>
          </div>
        </div>
      )}

      {/* 書き出し・保存の通知（error=失敗 / warn=低解像度フォールバック等。タップで閉じる） */}
      {exportNotice && (
        <div
          className={`ar-export-toast${exportNotice.kind === "warn" ? " is-warn" : ""}`}
          role="alert"
          onClick={() => setExportNotice(null)}
        >
          {exportNotice.text}
        </div>
      )}

      {/* 書き出しプレビュー */}
      {previewUrl !== null && (
        <div className="ar-preview" onClick={closePreview}>
          <div className="ar-preview-card" onClick={(e) => e.stopPropagation()}>
            <div className="ar-preview-head">
              <span>{t("studio.export.previewHeading")}</span>
              <span className="ar-preview-note">{t("studio.export.previewNote")}</span>
            </div>
            <div className="ar-preview-body">
              <img src={previewUrl} alt={t("studio.export.previewAlt")} />
            </div>
            <p className="studio-save-hint">{t("studio.export.saveHint")}</p>
            <div className="ar-preview-actions">
              <button className="ar-btn-sub" onClick={closePreview}>{t("studio.export.back")}</button>
              {onNext ? (
                <button
                  className="ar-btn-sub"
                  onClick={() => onNext(makeSnapshot(), savedOnce)}
                  title={t("studio.export.nextPhotoTitle")}
                >
                  {t("studio.export.nextPhoto", { n: nextCount })}
                </button>
              ) : (
                <button
                  className="ar-btn-sub"
                  onClick={() => onExit(makeSnapshot(), savedOnce)}
                  title={t("studio.export.finishTitle")}
                >
                  {t("studio.common.toBoard")}
                </button>
              )}
              <button className="ar-btn-main" onClick={saveExportImage}>
                <IconDownload size={15} />
                {t("studio.export.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編集 */}
      {exportView === "edit" && (
        <div className="ar-edit studio-edit">
          <div
            className="ar-edit-stage studio-stage"
            ref={arEditStageRef}
            style={
              {
                "--label-name-fs": labelNameScale, // ラベル1段目（山名）のサイズ倍率
                "--label-sub-fs": labelSubScale, // ラベル2段目（補足）のサイズ倍率
                "--label-ls": `${labelLetterSpace}em`, // ラベルの字間
                "--label-lh": labelLineHeight, // ラベルの行間（山名と補足の間隔）
                "--cap-title-fs": captionTitleScale, // 解説見出しのサイズ倍率
                "--cap-body-fs": captionBodyScale, // 解説本文のサイズ倍率
                "--cap-ls": `${captionLetterSpace}em`, // 解説の字間
                "--cap-lh": captionLineHeight, // 解説本文の行間倍率
                "--label-name-ff": roleFontStack(roleFonts.labelName), // 山名フォント
                "--label-sub-ff": roleFontStack(roleFonts.labelSub), // 補足フォント
                "--cap-title-ff": roleFontStack(roleFonts.captionTitle), // 見出しフォント
                "--cap-body-ff": roleFontStack(roleFonts.captionBody), // 本文フォント
                "--label-name-fw": pairWeightPx(roleFonts.labelName, "labelName", roleWeights.labelName), // 山名の太さ
                "--label-name-synth": pairSynthBold(roleFonts.labelName, roleWeights.labelName),
                "--label-sub-fw": pairWeightPx(roleFonts.labelSub, "labelSub", roleWeights.labelSub), // 補足の太さ
                "--label-sub-synth": pairSynthBold(roleFonts.labelSub, roleWeights.labelSub),
                "--cap-title-fw": pairWeightPx(roleFonts.captionTitle, "captionTitle", roleWeights.captionTitle), // 見出しの太さ
                "--cap-title-synth": pairSynthBold(roleFonts.captionTitle, roleWeights.captionTitle),
                "--cap-body-fw": pairWeightPx(roleFonts.captionBody, "captionBody", roleWeights.captionBody), // 本文の太さ
                "--cap-body-synth": pairSynthBold(roleFonts.captionBody, roleWeights.captionBody),
              } as React.CSSProperties
            }
          >
            {/* 記録の帯 ON のとき、内側の合成結果を包む外側フレーム（余白タブとは独立） */}
            <div
              className={`ar-note-wrap${exifOn ? " is-on" : ""}`}
              ref={noteWrapRef}
              style={{ background: exifOn ? noteBg : "transparent" }}
            >
            <div
              className="ar-frame"
              ref={arFrameRef}
              style={{ background: fAnyMargin ? frameMarginColor : "#000" }}
            >
              <div className="ar-frame-photo" style={framePhotoStyle}>
                <img
                  className="ar-edit-photo"
                  src={photoUrl}
                  alt=""
                  draggable={false}
                  style={frameCropImgStyle}
                  onLoad={(e) => {
                    const im = e.currentTarget;
                    if (im.naturalWidth) setPhotoNat({ w: im.naturalWidth, h: im.naturalHeight });
                  }}
                />
                {(["t", "b", "l", "r"] as const).map((d) => {
                  const s = fadeStyle(d);
                  return s ? <div key={d} style={s} /> : null;
                })}
              </div>
              {/* スナップガイド（ドラッグ中、中央・端に吸着した時だけ出る） */}
              {snapGuide.x !== null && (
                <div className="ar-snap-line ar-snap-line--v" style={{ left: `${snapGuide.x * 100}%` }} aria-hidden="true" />
              )}
              {snapGuide.y !== null && (
                <div className="ar-snap-line ar-snap-line--h" style={{ top: `${snapGuide.y * 100}%` }} aria-hidden="true" />
              )}
              {/* 山名ラベル */}
              {bakeLabels && (
                <>
                  {labelLineOn && (
                  <svg className="ar-edit-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {arLabels.map((lb, i) => {
                      if (lb.hidden) return null;
                      const sp = labelSidePoint(i);
                      const dp = photoToFrame(lb.dotU, lb.dotV);
                      const ax = sp.x * 100, ay = sp.y * 100;
                      const bx = dp.u * 100, by = dp.v * 100;
                      return (
                        <line
                          key={i}
                          x1={ax + (bx - ax) * 0.17}
                          y1={ay + (by - ay) * 0.17}
                          x2={ax + (bx - ax) * 0.83}
                          y2={ay + (by - ay) * 0.83}
                          stroke={labelLineColor}
                          strokeOpacity={0.9}
                          strokeWidth={1.2}
                          vectorEffect="non-scaling-stroke"
                        />
                      );
                    })}
                  </svg>
                  )}
                  {labelLineOn && (
                  <div className="ar-edit-chrome">
                    <svg className="ar-edit-guides" viewBox="0 0 100 100" preserveAspectRatio="none">
                      {arLabels.map((lb, i) => {
                      if (lb.hidden) return null;
                        const sp = labelSidePoint(i);
                        const dp = photoToFrame(lb.dotU, lb.dotV);
                        return (
                          <line
                            key={i}
                            x1={sp.x * 100}
                            y1={sp.y * 100}
                            x2={dp.u * 100}
                            y2={dp.v * 100}
                            stroke="rgb(214,180,106)"
                            strokeWidth={1.2}
                            vectorEffect="non-scaling-stroke"
                          />
                        );
                      })}
                    </svg>
                    {arLabels.map((lb, i) => {
                      if (lb.hidden) return null;
                      const sp = labelSidePoint(i);
                      const dp = photoToFrame(lb.dotU, lb.dotV);
                      return (
                        <div key={i}>
                          <div
                            className="ar-edit-dot"
                            style={{ left: `${dp.u * 100}%`, top: `${dp.v * 100}%` }}
                            onPointerDown={onEditDown(i, "dot")}
                            onPointerMove={onEditMove}
                            onPointerUp={onEditUp}
                            onPointerCancel={onEditUp}
                          />
                          <div
                            className="ar-edit-dot ar-edit-anchor"
                            style={{ left: `${sp.x * 100}%`, top: `${sp.y * 100}%` }}
                            onPointerDown={onEditDown(i, "labelAnchor")}
                            onPointerMove={onEditMove}
                            onPointerUp={onEditUp}
                            onPointerCancel={onEditUp}
                          />
                        </div>
                      );
                    })}
                  </div>
                  )}
                  {arLabels.map((lb, i) => {
                      if (lb.hidden) return null;
                    const lc = labelContent(lb);
                    const lp = photoToFrame(lb.labelU, lb.labelV);
                    return (
                      <div
                        key={i}
                        className={`ar-edit-label${labelBg !== "none" ? " has-panel" : ""}`}
                        data-idx={i}
                        style={
                          {
                            left: `${lp.u * 100}%`,
                            top: `${lp.v * 100}%`,
                            ...(lb.labelW ? { width: `${lb.labelW * 100}%` } : {}),
                            color: labelColor,
                            "--label-sh": labelShadow ? contrastShadow(labelColor) : "transparent",
                            ...(labelBg !== "none" ? { "--label-panel-bg": panelRgba(labelPanelColor, labelPanelOpacity) } : {}),
                          } as React.CSSProperties
                        }
                        onPointerDown={onEditDown(i, "label")}
                        onPointerMove={onEditMove}
                        onPointerUp={onEditUp}
                        onPointerCancel={onEditUp}
                      >
                        {/* 改行入りの山名は焼き込みと同じ行立て（空行除去）で表示する */}
                        <span className="ar-label-name">{nameLines(lc.name).join("\n")}</span>
                        {lc.sub && <span className="ar-label-sub">{lc.sub}</span>}
                        {(["l", "r"] as const).map((s2) => (
                          <span
                            key={s2}
                            className={`ar-cap-handle ar-cap-handle--${s2}`}
                            title={t("studio.stage.labelResize")}
                            onPointerDown={onLabelResizeDown(i)}
                            onPointerMove={onEditMove}
                            onPointerUp={onEditUp}
                            onPointerCancel={onEditUp}
                          />
                        ))}
                      </div>
                    );
                  })}
                </>
              )}
              {/* 解説 */}
              {captionLang !== "none" &&
                arLabels[captionIdx] &&
                (descJa(arLabels[captionIdx]) || descEn(arLabels[captionIdx])) && (
                  <div
                    className={`ar-caption${captionBg !== "none" ? " has-panel" : ""}`}
                    style={
                      {
                        left: `${photoToFrame(captionPos.u, captionPos.v).u * 100}%`,
                        top: `${photoToFrame(captionPos.u, captionPos.v).v * 100}%`,
                        width: `${captionW * 100}%`,
                        color: captionColor,
                        "--cap-sh": captionShadow ? contrastShadow(captionColor, 0.85) : "transparent",
                        "--cap-tag-bg": pillColors().bg,
                        "--cap-tag-fg": pillColors().fg,
                        ...(captionBg !== "none" ? { "--cap-panel-bg": panelRgba(captionPanelColor, captionPanelOpacity) } : {}),
                      } as React.CSSProperties
                    }
                    onPointerDown={onCaptionDown}
                    onPointerMove={onEditMove}
                    onPointerUp={onEditUp}
                    onPointerCancel={onEditUp}
                  >
                    {capSharedTitleParts.length > 0 && (
                      <div
                        className={`ar-cap-shared${capSharedRow ? " is-row" : ""}${capSharedHasTags ? " has-tags" : ""}`}
                        style={capSharedRow ? ({ "--cap-sub-ratio": 0.8 } as React.CSSProperties) : undefined}
                      >
                        {capSharedRow ? (
                          <>
                            <div className="ar-caption-title">{oneLineName(capName)}</div>
                            <div className="ar-caption-title ar-cap-sep">/</div>
                            <div className="ar-caption-title is-sub">{oneLineName(capNameEn)}</div>
                          </>
                        ) : (
                          capSharedTitleParts.map((p, i) => (
                            <div key={i} className={`ar-caption-title${p.sub ? " is-sub" : ""}`}>{p.text}</div>
                          ))
                        )}
                      </div>
                    )}
                    {capSharedTitleParts.length > 0 && capTagEls(capTagLang)}
                    <div className={`ar-cap-cols${capBoth && captionLayout === "vertical" ? " is-vertical" : ""}`}>
                      {(captionLang === "ja" || captionLang === "both") && descJa(arLabels[captionIdx]) && (
                        <div
                          className="ar-cap-col"
                          style={capBoth && captionLayout === "horizontal" ? { flex: `${captionSplit} 1 0` } : undefined}
                        >
                          {capColHasTitle && <div className="ar-caption-title">{nameLines(arLabels[captionIdx].name).join("\n")}</div>}
                          {capColHasTitle && !capBoth && capTagEls(capTagLang)}
                          <p className="ar-caption-text">{descJa(arLabels[captionIdx])}</p>
                        </div>
                      )}
                      {capBoth && captionLayout === "horizontal" && (
                        <div
                          className="ar-cap-divider"
                          title={t("studio.stage.capDividerTitle")}
                          onPointerDown={onCapSplitDown}
                          onPointerMove={onEditMove}
                          onPointerUp={onEditUp}
                          onPointerCancel={onEditUp}
                        />
                      )}
                      {(captionLang === "en" || captionLang === "both") && descEn(arLabels[captionIdx]) && (
                        <div
                          className="ar-cap-col"
                          style={capBoth && captionLayout === "horizontal" ? { flex: `${1 - captionSplit} 1 0` } : undefined}
                        >
                          {capColHasTitle && <div className="ar-caption-title">{nameLines(arLabels[captionIdx].nameEn || arLabels[captionIdx].name).join("\n")}</div>}
                          {capColHasTitle && !capBoth && capTagEls(capTagLang)}
                          <p className="ar-caption-text">{descEn(arLabels[captionIdx])}</p>
                        </div>
                      )}
                    </div>
                    {(["l", "r", "t", "b"] as const).map((s) => (
                      <span
                        key={s}
                        className={`ar-cap-handle ar-cap-handle--${s}`}
                        title={s === "l" || s === "r" ? t("studio.stage.capResizeWidth") : t("studio.stage.capResizeHeight")}
                        onPointerDown={onCapResizeDown}
                        onPointerMove={onEditMove}
                        onPointerUp={onEditUp}
                        onPointerCancel={onEditUp}
                      />
                    ))}
                  </div>
                )}
              {/* センタータイトル */}
              {titleOn && (() => {
                const tp = titleParts();
                if (!tp) return null;
                const tf = photoToFrame(titlePos.u, titlePos.v);
                return (
                  <div
                    className="ar-title"
                    style={
                      {
                        left: `${tf.u * 100}%`,
                        top: `${tf.v * 100}%`,
                        width: `${(titleW ?? 0.98) * 100}%`,
                        color: titleColor,
                        "--title-ff": roleFontStack(titleFont),
                        "--title-fw": pairWeightPx(titleFont, "title", titleWeight),
                        "--title-sub-fw": titleSubWeightPx(pairWeightPx(titleFont, "title", titleWeight)),
                        "--title-synth": pairSynthBold(titleFont, titleWeight),
                        "--title-fs": titleScale,
                        "--title-side-fs": titleSideScale,
                        "--title-ls": titleLetterSpace,
                        "--title-gap": titleLineHeight,
                        "--title-sh": titleShadow ? contrastShadow(titleColor) : "transparent",
                      } as React.CSSProperties
                    }
                    onPointerDown={onTitleDown}
                    onPointerMove={onEditMove}
                    onPointerUp={onEditUp}
                    onPointerCancel={onEditUp}
                  >
                    {titleLightSynth && titleErodePx > 0 && (
                      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
                        <defs>
                          <filter id="ar-title-erode">
                            <feMorphology operator="erode" radius={titleErodePx} />
                          </filter>
                        </defs>
                      </svg>
                    )}
                    {tp.over && <span className="ar-title-over">{tp.over}</span>}
                    <span
                      className="ar-title-main"
                      style={titleLightSynth && titleErodePx > 0 ? { filter: "url(#ar-title-erode)" } : undefined}
                    >
                      {tp.main}
                    </span>
                    {tp.num && <span className="ar-title-num">{tp.num}</span>}
                    {(["l", "r"] as const).map((s2) => (
                      <span
                        key={s2}
                        className={`ar-cap-handle ar-cap-handle--${s2}`}
                        title={t("studio.stage.labelResize")}
                        onPointerDown={onTitleResizeDown}
                        onPointerMove={onEditMove}
                        onPointerUp={onEditUp}
                        onPointerCancel={onEditUp}
                      />
                    ))}
                  </div>
                );
              })()}
            </div>
              {/* 記録の帯（外側フレーム下部の中央。書き出しと同じ2トーン配色） */}
              {exifOn && (() => {
                const ink = noteInkColors();
                const ch = (photoNat?.h ?? 1000) * fChF;
                const cw = (photoNat?.w ?? 1500) * fCwF;
                const innerW = cw * (1 + fMlr), innerH = ch * (1 + fMtb);
                const totalH = innerH + NOTE_EDGE * ch + noteBand * ch;
                const outerW = innerW + NOTE_EDGE * ch * 2;
                // 焼き込みの文字サイズ基準は内側（L=max(OW,OH)）。プレビューの cqmax は
                // 外枠（縁＋帯込み）基準なので、その比で補正して実寸を揃える。
                const noteK = Math.max(innerW, innerH) / Math.max(outerW, totalH);
                return (
                  <div
                    className="ar-exif"
                    style={
                      {
                        height: `${((noteBand * ch) / totalH) * 100}%`,
                        fontFamily: roleFontStack(noteFont),
                        "--exif-main": ink.main,
                        "--exif-sub": ink.sub,
                        "--note-k": noteK,
                      } as React.CSSProperties
                    }
                    aria-hidden="true"
                  >
                    {noteMode === "camera" ? (
                      <>
                        {(exifModel || exifMaker) && (
                          <span className="ar-exif-model">
                            <span className="ar-exif-dim">Shot on</span> <b>{exifModel}</b>
                            {exifMaker && <span className="ar-exif-dim"> {exifMaker}</span>}
                          </span>
                        )}
                        {exifSpec && <span className="ar-exif-spec">{exifSpec}</span>}
                      </>
                    ) : (
                      <span className="ar-exif-free">
                        {noteLine1 && (
                          <span
                            className="ar-exif-l1"
                            style={{
                              fontWeight: noteL1.bold ? 700 : 600,
                              fontStyle: noteL1.italic ? "italic" : "normal",
                              color: noteL1.dim ? "var(--exif-sub)" : "var(--exif-main)",
                            }}
                          >
                            {noteLine1}
                          </span>
                        )}
                        {noteLine2 && (
                          <span
                            className="ar-exif-l2"
                            style={{
                              fontWeight: noteL2.bold ? 600 : 400,
                              fontStyle: noteL2.italic ? "italic" : "normal",
                              color: noteL2.dim ? "var(--exif-sub)" : "var(--exif-main)",
                            }}
                          >
                            {noteLine2}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
            <p className="studio-stage-hint">{t("studio.stage.hint")}</p>
          </div>

          {/* 操作パネル。PCで畳んだときは右端の細いレールだけ残してステージを全幅に */}
          {!panelOpen && !isNarrow ? (
            <div className="studio-rail">
              <button className="studio-icon-btn" onClick={() => setPanelOpen(true)} title={t("studio.stage.openSettings")}>
                <IconCaret dir="left" size={16} />
              </button>
              <span className="studio-rail-label" aria-hidden="true">{t("studio.common.finishing")}</span>
              <button className="studio-icon-btn" onClick={openExportPreview} disabled={previewBaking} title={t("studio.stage.export")}>
                <IconDownload size={15} />
              </button>
            </div>
          ) : (
          <div className={`studio-panel${panelOpen ? "" : " is-closed"}`}>
            <div className="studio-panel-head">
              {/* PC: 畳むボタンは左端（ステージとの境界側）。右へ縮む動きと向きが揃う */}
              {!isNarrow && (
                <button className="studio-icon-btn" onClick={() => setPanelOpen(false)} title={t("studio.stage.collapse")}>
                  <IconCaret dir="right" size={16} />
                </button>
              )}
              <span className="studio-panel-title">
                {t("studio.common.finishing")}
                {activeTemplate && (
                  <span className="studio-panel-tpl" title={t(activeTemplate.sub)}>{activeTemplate.name}</span>
                )}
              </span>
              <div className="studio-mode" role="group" aria-label={t("studio.panel.modeGroupAria")}>
                {(
                  [
                    ["simple", t("studio.panel.modeSimple"), t("studio.panel.modeSimpleHint")],
                    ["full", t("studio.panel.modeFull"), t("studio.panel.modeFullHint")],
                  ] as ["simple" | "full", string, string][]
                ).map(([m, label, hint]) => (
                  <button
                    key={m}
                    type="button"
                    className={panelMode === m ? "is-active" : ""}
                    onClick={() => changePanelMode(m)}
                    title={hint}
                    aria-pressed={panelMode === m}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* スマホ: ボトムシートなので畳むボタンは従来どおり右端・下向き */}
              {isNarrow && (
                <button className="studio-icon-btn" onClick={() => setPanelOpen((o) => !o)} title={panelOpen ? t("studio.stage.collapse") : t("studio.stage.expand")}>
                  <IconCaret dir={panelOpen ? "down" : "up"} size={16} />
                </button>
              )}
            </div>
            {panelOpen && (
              <>
              <div className="studio-tabs" role="tablist" aria-label={t("studio.tabs.ariaLabel")}>
                {(
                  [
                    ["label", t("studio.tabs.label")],
                    ["caption", t("studio.tabs.caption")],
                    ["title", t("studio.tabs.title")],
                    ["frame", t("studio.tabs.frame")],
                    ["note", t("studio.tabs.note")],
                  ] as [PanelTab, string][]
                )
                  .filter(([id]) => visibleTabs.includes(id))
                  .map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={panelTab === id}
                    className={`studio-tab${panelTab === id ? " is-active" : ""}`}
                    onClick={() => setPanelTab(id)}
                  >
                    {label}
                    <span className={`studio-tab-dot${tabOn[id] ? " is-on" : ""}`} aria-hidden="true" />
                  </button>
                ))}
              </div>
              <div className="studio-panel-body">
                {/* 山名 */}
                {panelTab === "label" && (
                <section className="studio-sec">
                  {dataEdit}
                  <label className="switch-row">
                    <span>{t("studio.label.bake")}</span>
                    <input type="checkbox" className="switch" checked={bakeLabels} onChange={(e) => setBakeLabels(e.target.checked)} />
                  </label>
                  {bakeLabels && (
                    <>
                      <div className="ar-fs-row">
                        <span>{t("studio.label.display")}</span>
                        <div className="ar-font-sel">
                          <select value={labelMode} onChange={(e) => setLabelMode(e.target.value as LabelMode)} aria-label={t("studio.label.displayAria")}>
                            <option value="jaSubEnElev">{t("studio.label.optJaSubEnElev")}</option>
                            <option value="jaSubEn">{t("studio.label.optJaSubEn")}</option>
                            <option value="jaSubElev">{t("studio.label.optJaSubElev")}</option>
                            <option value="enSubElev">{t("studio.label.optEnSubElev")}</option>
                            <option value="jaOnly">{t("studio.label.optJaOnly")}</option>
                            <option value="enOnly">{t("studio.label.optEnOnly")}</option>
                          </select>
                        </div>
                      </div>
                      <div className="ar-fs-row">
                        <span>{t("studio.label.textBg")}</span>
                        <div className="seg" role="group" aria-label={t("studio.label.textBgAria")}>
                          {([[t("studio.common.bgNone"), "none"], [t("studio.common.bgSolid"), "solid"]] as [string, BgPanel][]).map(([lab, v]) => (
                            <button key={v} className={labelBg === v ? "is-active" : ""} onClick={() => setLabelBg(v)}>{lab}</button>
                          ))}
                        </div>
                      </div>
                      {labelBg !== "none" && (
                        <>
                          <div className="ar-fs-row">
                            <span>{t("studio.label.bgColor")}</span>
                            <input type="color" className="ar-color-input" value={labelPanelColor} onChange={(e) => setLabelPanelColor(e.target.value)} aria-label={t("studio.label.bgColorAria")} />
                          </div>
                          <div className="ar-fs-slider-row">
                            <span>{t("studio.label.bgOpacity")}</span>
                            <span className="ar-fs-val">{Math.round(labelPanelOpacity * 100)}%</span>
                          </div>
                          <FsSlider min={0.1} max={1} step={0.05} value={labelPanelOpacity} onChange={setLabelPanelOpacity} ariaLabel={t("studio.label.bgOpacityAria")} />
                        </>
                      )}
                      <div className="ar-fs-row">
                        <span>{t("studio.label.textColor")}</span>
                        <input type="color" className="ar-color-input" value={labelColor} onChange={(e) => setLabelColor(e.target.value)} aria-label={t("studio.label.textColor")} />
                      </div>
                      <label className="switch-row">
                        <span>{t("studio.label.leaderLine")}</span>
                        <input type="checkbox" className="switch" checked={labelLineOn} onChange={(e) => setLabelLineOn(e.target.checked)} />
                      </label>
                      {labelLineOn && (
                        <div className="ar-fs-row">
                          <span>{t("studio.label.lineColor")}</span>
                          <input type="color" className="ar-color-input" value={labelLineColor} onChange={(e) => setLabelLineColor(e.target.value)} aria-label={t("studio.label.lineColorAria")} />
                        </div>
                      )}
                      <label className="switch-row">
                        <span>{t("studio.label.textShadow")}</span>
                        <input type="checkbox" className="switch" checked={labelShadow} onChange={(e) => setLabelShadow(e.target.checked)} />
                      </label>
                      <div className="ar-fs-slider-row">
                        <span>{t("studio.label.nameSize")}</span>
                        <span className="ar-fs-val">{Math.round(labelNameScale * 100)}%</span>
                      </div>
                      <FsSlider min={0.7} max={2.0} step={0.05} value={labelNameScale} onChange={setLabelNameScale} ariaLabel={t("studio.label.nameSize")} />
                      {fontRow("labelName", t("studio.label.nameFont"))}
                      <div className="ar-fs-slider-row">
                        <span>{t("studio.label.letterSpace")}</span>
                        <span className="ar-fs-val">{labelLetterSpace.toFixed(2)}em</span>
                      </div>
                      <FsSlider min={0} max={0.3} step={0.01} value={labelLetterSpace} onChange={setLabelLetterSpace} ariaLabel={t("studio.label.letterSpaceAria")} />
                      {labelHasSub && (
                        <>
                          <div className="ar-fs-slider-row">
                            <span>{t("studio.label.subSize")}</span>
                            <span className="ar-fs-val">{Math.round(labelSubScale * 100)}%</span>
                          </div>
                          <FsSlider min={0.7} max={1.6} step={0.05} value={labelSubScale} onChange={setLabelSubScale} ariaLabel={t("studio.label.subSize")} />
                          {fontRow("labelSub", t("studio.label.subFont"))}
                          <div className="ar-fs-slider-row">
                            <span>{t("studio.label.lineHeight")}</span>
                            <span className="ar-fs-val">{Math.round(labelLineHeight * 100)}%</span>
                          </div>
                          <FsSlider min={0.6} max={2.0} step={0.05} value={labelLineHeight} onChange={setLabelLineHeight} ariaLabel={t("studio.label.lineHeightAria")} />
                        </>
                      )}
                    </>
                  )}
                </section>
                )}

                {/* 解説 */}
                {panelTab === "caption" && (
                <section className="studio-sec">
                  {dataEdit}
                  {subjectRow}
                  <div className="ar-fs-row">
                    <span>{t("studio.caption.language")}</span>
                    <div className="seg" role="group" aria-label={t("studio.caption.languageAria")}>
                      {([[t("studio.common.langJa"), "ja"], [t("studio.common.langEn"), "en"], [t("studio.common.langBoth"), "both"], [t("studio.common.bgNone"), "none"]] as [string, "ja" | "en" | "both" | "none"][]).map(([lab, v]) => (
                        <button key={v} className={captionLang === v ? "is-active" : ""} onClick={() => setCaptionLang(v)}>{lab}</button>
                      ))}
                    </div>
                  </div>
                  {captionLang !== "none" && (
                    <>
                      {captionLang === "both" && (
                        <>
                          <div className="ar-fs-row">
                            <span>{t("studio.caption.layout")}</span>
                            <div className="seg" role="group" aria-label={t("studio.caption.layoutAria")}>
                              {([[t("studio.caption.layoutHorizontal"), "horizontal"], [t("studio.caption.layoutVertical"), "vertical"]] as [string, "horizontal" | "vertical"][]).map(([lab, v]) => (
                                <button key={v} className={captionLayout === v ? "is-active" : ""} onClick={() => setCaptionLayout(v)}>{lab}</button>
                              ))}
                            </div>
                          </div>
                          <div className="ar-fs-row">
                            <span>{t("studio.caption.headingMode")}</span>
                            <div className="ar-font-sel">
                              <select value={captionTitleMode} onChange={(e) => setCaptionTitleMode(e.target.value as "each" | "groupV" | "groupH" | "ja" | "en")} aria-label={t("studio.caption.headingModeAria")}>
                                <option value="each">{t("studio.caption.headingEach")}</option>
                                <option value="groupV">{t("studio.caption.headingGroupV")}</option>
                                <option value="groupH">{t("studio.caption.headingGroupH")}</option>
                                <option value="ja">{t("studio.caption.headingJaOnly")}</option>
                                <option value="en">{t("studio.caption.headingEnOnly")}</option>
                              </select>
                            </div>
                          </div>
                        </>
                      )}
                      <div className="ar-fs-row">
                        <span>{t("studio.caption.length")}</span>
                        <div className="seg" role="group" aria-label={t("studio.caption.lengthAria")}>
                          {([[t("studio.caption.lengthLong"), "long"], [t("studio.caption.lengthShort"), "short"]] as [string, "long" | "short"][]).map(([lab, v]) => (
                            <button key={v} className={captionLength === v ? "is-active" : ""} onClick={() => setCaptionLength(v)}>{lab}</button>
                          ))}
                        </div>
                      </div>
                      {/* 本文の編集。辞書に解説がない山でもここで書ける */}
                      {(captionLang === "ja" || captionLang === "both") && (
                        <textarea
                          className="ar-cap-editor"
                          rows={4}
                          value={capItem ? descJa(capItem) ?? "" : ""}
                          placeholder={t("studio.caption.jaPlaceholder")}
                          onChange={(e) => setCapText("ja", e.target.value)}
                          aria-label={captionLength === "short" ? t("studio.caption.jaAriaShort") : t("studio.caption.jaAriaLong")}
                        />
                      )}
                      {(captionLang === "en" || captionLang === "both") && (
                        <textarea
                          className="ar-cap-editor"
                          rows={4}
                          value={capItem ? descEn(capItem) ?? "" : ""}
                          placeholder="No description in the dictionary. Write your own here."
                          onChange={(e) => setCapText("en", e.target.value)}
                          aria-label={captionLength === "short" ? t("studio.caption.enAriaShort") : t("studio.caption.enAriaLong")}
                        />
                      )}
                      {capEdited && (
                        <div className="ar-fs-row">
                          <span>{t("studio.caption.edited")}</span>
                          <button type="button" className="ar-cap-restore" onClick={restoreCapText}>{t("studio.caption.restore")}</button>
                        </div>
                      )}
                      <div className="ar-fs-row">
                        <span>{t("studio.caption.textBg")}</span>
                        <div className="seg" role="group" aria-label={t("studio.caption.textBgAria")}>
                          {([[t("studio.common.bgNone"), "none"], [t("studio.common.bgSolid"), "solid"]] as [string, BgPanel][]).map(([lab, v]) => (
                            <button key={v} className={captionBg === v ? "is-active" : ""} onClick={() => setCaptionBg(v)}>{lab}</button>
                          ))}
                        </div>
                      </div>
                      {captionBg !== "none" && (
                        <>
                          <div className="ar-fs-row">
                            <span>{t("studio.caption.bgColor")}</span>
                            <input type="color" className="ar-color-input" value={captionPanelColor} onChange={(e) => setCaptionPanelColor(e.target.value)} aria-label={t("studio.caption.bgColorAria")} />
                          </div>
                          <div className="ar-fs-slider-row">
                            <span>{t("studio.caption.bgOpacity")}</span>
                            <span className="ar-fs-val">{Math.round(captionPanelOpacity * 100)}%</span>
                          </div>
                          <FsSlider min={0.1} max={1} step={0.05} value={captionPanelOpacity} onChange={setCaptionPanelOpacity} ariaLabel={t("studio.caption.bgOpacityAria")} />
                        </>
                      )}
                      <div className="ar-fs-row">
                        <span>{t("studio.caption.textColor")}</span>
                        <input type="color" className="ar-color-input" value={captionColor} onChange={(e) => setCaptionColor(e.target.value)} aria-label={t("studio.caption.textColorAria")} />
                      </div>
                      <label className="switch-row">
                        <span>{t("studio.caption.textShadow")}</span>
                        <input type="checkbox" className="switch" checked={captionShadow} onChange={(e) => setCaptionShadow(e.target.checked)} />
                      </label>
                      <div className="ar-fs-slider-row">
                        <span>{t("studio.caption.headingSize")}</span>
                        <span className="ar-fs-val">{Math.round(captionTitleScale * 100)}%</span>
                      </div>
                      <FsSlider min={0.7} max={2.0} step={0.05} value={captionTitleScale} onChange={setCaptionTitleScale} ariaLabel={t("studio.caption.headingSize")} />
                      <div className="ar-fs-slider-row">
                        <span>{t("studio.caption.bodySize")}</span>
                        <span className="ar-fs-val">{Math.round(captionBodyScale * 100)}%</span>
                      </div>
                      <FsSlider min={0.7} max={1.6} step={0.05} value={captionBodyScale} onChange={setCaptionBodyScale} ariaLabel={t("studio.caption.bodySize")} />
                      {fontRow("captionTitle", t("studio.caption.headingFont"))}
                      {fontRow("captionBody", t("studio.caption.bodyFont"))}
                      <div className="ar-fs-slider-row">
                        <span>{t("studio.caption.letterSpace")}</span>
                        <span className="ar-fs-val">{captionLetterSpace.toFixed(2)}em</span>
                      </div>
                      <FsSlider min={0} max={0.3} step={0.01} value={captionLetterSpace} onChange={setCaptionLetterSpace} ariaLabel={t("studio.caption.letterSpaceAria")} />
                      <div className="ar-fs-slider-row">
                        <span>{t("studio.caption.lineHeight")}</span>
                        <span className="ar-fs-val">{Math.round(captionLineHeight * 100)}%</span>
                      </div>
                      <FsSlider min={0.6} max={2.0} step={0.05} value={captionLineHeight} onChange={setCaptionLineHeight} ariaLabel={t("studio.caption.lineHeightAria")} />
                      {/* タグ */}
                      <label className="switch-row">
                        <span>{t("studio.caption.tagElevation")}</span>
                        <input type="checkbox" className="switch" checked={capShowElev} onChange={(e) => setCapShowElev(e.target.checked)} />
                      </label>
                      <label className="switch-row">
                        <span>{t("studio.caption.tagLocation")}</span>
                        <input type="checkbox" className="switch" checked={capShowLoc} onChange={(e) => setCapShowLoc(e.target.checked)} />
                      </label>
                      {capItemTags.length > 0 && (
                        <div className="studio-tags">
                          {capItemTags.map((t) => (
                            <button
                              key={t}
                              type="button"
                              className={`studio-tag${capSelectedTags.includes(t) ? " is-on" : ""}`}
                              onClick={() => toggleCapTag(t)}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      )}
                      {/* 自由タグの追加（辞書に無いタグも書ける。追加すると表示ONになる） */}
                      <div className="studio-tag-add">
                        <input
                          type="text"
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addCapTag();
                            }
                          }}
                          placeholder={t("studio.caption.tagAddPlaceholder")}
                          aria-label={t("studio.caption.tagAddAria")}
                          autoComplete="off"
                        />
                        <button type="button" onClick={addCapTag} disabled={!newTag.trim()}>{t("studio.caption.tagAdd")}</button>
                      </div>
                      <div className="ar-fs-row">
                        <span>{t("studio.caption.tagColor")}</span>
                        <input type="color" className="ar-color-input" value={tagColor} onChange={(e) => setTagColor(e.target.value)} aria-label={t("studio.caption.tagColorAria")} />
                      </div>
                      <div className="ar-fs-row">
                        <span>{t("studio.caption.tagUsage")}</span>
                        <div className="seg" role="group" aria-label={t("studio.caption.tagUsageAria")}>
                          {([[t("studio.caption.tagUsageBg"), "bg"], [t("studio.caption.tagUsageText"), "text"]] as [string, "bg" | "text"][]).map(([lab, v]) => (
                            <button key={v} className={tagColorTarget === v ? "is-active" : ""} onClick={() => setTagColorTarget(v)}>{lab}</button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </section>
                )}

                {/* センタータイトル */}
                {panelTab === "title" && (
                <section className="studio-sec">
                  {dataEdit}
                  {subjectRow}
                  <label className="switch-row">
                    <span>{t("studio.title.enable")}</span>
                    <input type="checkbox" className="switch" checked={titleOn} onChange={(e) => setTitleOn(e.target.checked)} />
                  </label>
                  {titleOn && (
                    <>
                      <div className="ar-fs-row">
                        <span>{t("studio.title.language")}</span>
                        <div className="seg" role="group" aria-label={t("studio.title.languageAria")}>
                          {([[t("studio.common.langEn"), "en"], [t("studio.common.langJa"), "ja"]] as [string, "en" | "ja"][]).map(([lab, v]) => (
                            <button key={v} className={titleLang === v ? "is-active" : ""} onClick={() => setTitleLang(v)}>{lab}</button>
                          ))}
                        </div>
                      </div>
                      <label className="switch-row">
                        <span>{t("studio.title.showSub")}</span>
                        <input type="checkbox" className="switch" checked={titleShowOver} onChange={(e) => setTitleShowOver(e.target.checked)} />
                      </label>
                      <label className="switch-row">
                        <span>{t("studio.title.showElevation")}</span>
                        <input type="checkbox" className="switch" checked={titleShowNum} onChange={(e) => setTitleShowNum(e.target.checked)} />
                      </label>
                      <div className="ar-fs-slider-row">
                        <span>{t("studio.title.size")}</span>
                        <span className="ar-fs-val">{Math.round(titleScale * 100)}%</span>
                      </div>
                      <FsSlider min={0.3} max={2.0} step={0.05} value={titleScale} onChange={setTitleScale} ariaLabel={t("studio.title.sizeAria")} />
                      <div className="ar-fs-slider-row">
                        <span>{t("studio.title.sideSize")}</span>
                        <span className="ar-fs-val">{Math.round(titleSideScale * 100)}%</span>
                      </div>
                      <FsSlider min={0.3} max={2.0} step={0.05} value={titleSideScale} onChange={setTitleSideScale} ariaLabel={t("studio.title.sideSizeAria")} />
                      <div className="ar-fs-row">
                        <span>{t("studio.title.textColor")}</span>
                        <input type="color" className="ar-color-input" value={titleColor} onChange={(e) => setTitleColor(e.target.value)} aria-label={t("studio.title.textColorAria")} />
                      </div>
                      <label className="switch-row">
                        <span>{t("studio.title.textShadow")}</span>
                        <input type="checkbox" className="switch" checked={titleShadow} onChange={(e) => setTitleShadow(e.target.checked)} />
                      </label>
                      <div className="ar-fs-row">
                        <span>{t("studio.title.font")}</span>
                        <div className="ar-font-sels">
                          <div className="ar-font-sel">
                            <select value={titleFont} onChange={(e) => setTitleFont(e.target.value as FontPairId)} aria-label={t("studio.title.fontAria")}>
                              {FONT_PAIR_IDS.map((id) => (
                                <option key={id} value={id}>{FONT_PAIRS[id].label}</option>
                              ))}
                            </select>
                          </div>
                          {weightSelect(titleWeight, setTitleWeight, t("studio.font.weightAria", { label: t("studio.title.fontAria") }))}
                        </div>
                      </div>
                      <div className="ar-fs-slider-row">
                        <span>{t("studio.title.letterSpace")}</span>
                        <span className="ar-fs-val">{Math.round(titleLetterSpace * 100)}%</span>
                      </div>
                      <FsSlider min={0} max={3} step={0.05} value={titleLetterSpace} onChange={setTitleLetterSpace} ariaLabel={t("studio.title.letterSpaceAria")} />
                      <div className="ar-fs-slider-row">
                        <span>{t("studio.title.lineHeight")}</span>
                        <span className="ar-fs-val">{Math.round(titleLineHeight * 100)}%</span>
                      </div>
                      <FsSlider min={0.3} max={2.5} step={0.05} value={titleLineHeight} onChange={setTitleLineHeight} ariaLabel={t("studio.title.lineHeightAria")} />
                    </>
                  )}
                </section>
                )}

                {/* 余白・切り抜き */}
                {panelTab === "frame" && (
                <>
                <section className="studio-sec">
                  <h3>{t("studio.frame.marginHeading")}</h3>
                  {(["t", "b", "l", "r"] as const).map((d) => {
                    const dirLabel = t(d === "t" ? "studio.frame.dirTop" : d === "b" ? "studio.frame.dirBottom" : d === "l" ? "studio.frame.dirLeft" : "studio.frame.dirRight");
                    return (
                    <div key={`m${d}`}>
                      <div className="ar-fs-slider-row">
                        <span>{t("studio.frame.marginDir", { dir: dirLabel })}</span>
                        <span className="ar-fs-val">{Math.round(frameMargin[d] * 100)}%</span>
                      </div>
                      <FsSlider min={0} max={1} step={0.01} value={frameMargin[d]} onChange={(v) => setFrameMargin((p) => ({ ...p, [d]: v }))} ariaLabel={t("studio.frame.marginDir", { dir: dirLabel })} />
                    </div>
                    );
                  })}
                  <div className="ar-fs-row">
                    <span>{t("studio.frame.marginColor")}</span>
                    <input type="color" className="ar-color-input" value={frameMarginColor} onChange={(e) => setFrameMarginColor(e.target.value)} aria-label={t("studio.frame.marginColor")} disabled={frameMarginAuto} />
                  </div>
                  <label className="switch-row">
                    <span>{t("studio.frame.marginAuto")}</span>
                    <input type="checkbox" className="switch" checked={frameMarginAuto} onChange={(e) => setFrameMarginAuto(e.target.checked)} />
                  </label>
                  <div className="ar-fs-slider-row">
                    <span>{t("studio.frame.fade")}</span>
                    <span className="ar-fs-val">{Math.round(frameFade * 100)}%</span>
                  </div>
                  <FsSlider min={0} max={0.5} step={0.01} value={frameFade} onChange={setFrameFade} ariaLabel={t("studio.frame.fadeAria")} />
                </section>
                <section className="studio-sec">
                  <h3>{t("studio.frame.cropHeading")}</h3>
                  {(["l", "t", "r", "b"] as const).map((d) => {
                    const dirLabel = t(d === "t" ? "studio.frame.dirTop" : d === "b" ? "studio.frame.dirBottom" : d === "l" ? "studio.frame.dirLeft" : "studio.frame.dirRight");
                    return (
                    <div key={`c${d}`}>
                      <div className="ar-fs-slider-row">
                        <span>{t("studio.frame.cropDir", { dir: dirLabel })}</span>
                        <span className="ar-fs-val">{Math.round(cropInset[d] * 100)}%</span>
                      </div>
                      <FsSlider min={0} max={0.45} step={0.01} value={cropInset[d]} onChange={(v) => setCropInset((p) => ({ ...p, [d]: v }))} ariaLabel={t("studio.frame.cropDir", { dir: dirLabel })} />
                    </div>
                    );
                  })}
                </section>
                </>
                )}

                {/* 記録（下の帯: 撮影情報 or 自由入力の山行記録） */}
                {panelTab === "note" && (
                <section className="studio-sec">
                  <h3>{t("studio.note.heading")}</h3>
                  <label className="switch-row">
                    <span>{t("studio.note.enable")}</span>
                    <input type="checkbox" className="switch" checked={exifOn} onChange={(e) => toggleExif(e.target.checked)} />
                  </label>
                  {exifOn && (
                    <>
                      <div className="ar-fs-row">
                        <span>{t("studio.note.frameColor")}</span>
                        <input type="color" className="ar-color-input" value={noteBg} onChange={(e) => setNoteBg(e.target.value)} aria-label={t("studio.note.frameColorAria")} />
                      </div>
                      <label className="switch-row">
                        <span>文字の色をフレームに合わせる</span>
                        <input type="checkbox" className="switch" checked={noteInkAuto} onChange={(e) => setNoteInkAuto(e.target.checked)} />
                      </label>
                      {!noteInkAuto && (
                        <div className="ar-fs-row">
                          <span>文字の色</span>
                          <input type="color" className="ar-color-input" value={noteInk} onChange={(e) => setNoteInk(e.target.value)} aria-label="記録の文字の色" />
                        </div>
                      )}
                      <div className="ar-fs-row">
                        <span>フォント</span>
                        <div className="ar-font-sel">
                          <select value={noteFont} onChange={(e) => setNoteFont(e.target.value as FontPairId)} aria-label="記録のフォント">
                            {FONT_PAIR_IDS.map((id) => (
                              <option key={id} value={id}>{FONT_PAIRS[id].label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {/* 下の帯の高さは「上の縁より何%広げるか」で指定。+0% = 上下の縁が同じ幅。 */}
                      <div className="ar-fs-slider-row">
                        <span>{t("studio.note.bandHeight")}</span>
                        <span className="ar-fs-val">+{Math.round(Math.max(0, noteBand - NOTE_EDGE) * 100)}%</span>
                      </div>
                      <FsSlider
                        min={0}
                        max={0.35}
                        step={0.005}
                        value={Math.max(0, noteBand - NOTE_EDGE)}
                        onChange={(v) => setNoteBand(NOTE_EDGE + v)}
                        ariaLabel={t("studio.note.bandHeightAria")}
                      />
                      <div className="ar-fs-row">
                        <span>{t("studio.note.content")}</span>
                        <div className="seg" role="group" aria-label={t("studio.note.contentAria")}>
                          {([[t("studio.note.contentCamera"), "camera"], [t("studio.note.contentFree"), "free"]] as [string, "camera" | "free"][]).map(([lab, v]) => (
                            <button key={v} className={noteMode === v ? "is-active" : ""} onClick={() => setNoteMode(v)}>{lab}</button>
                          ))}
                        </div>
                      </div>
                      {noteMode === "camera" ? (
                        <div className="studio-data-edit">
                          <span className="studio-data-head">{t("studio.note.exifHeading")}</span>
                          <input
                            type="text"
                            className="studio-data-input"
                            value={exifModel}
                            onChange={(e) => setExifModel(e.target.value)}
                            placeholder={t("studio.note.exifModelPlaceholder")}
                            aria-label={t("studio.note.exifModelAria")}
                            autoComplete="off"
                          />
                          <input
                            type="text"
                            className="studio-data-input"
                            value={exifMaker}
                            onChange={(e) => setExifMaker(e.target.value)}
                            placeholder={t("studio.note.exifMakerPlaceholder")}
                            aria-label={t("studio.note.exifMakerAria")}
                            autoComplete="off"
                          />
                          <input
                            type="text"
                            className="studio-data-input"
                            value={exifSpec}
                            onChange={(e) => setExifSpec(e.target.value)}
                            placeholder={t("studio.note.exifSpecPlaceholder")}
                            aria-label={t("studio.note.exifSpecAria")}
                            autoComplete="off"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="studio-data-edit">
                            <span className="studio-data-head">{t("studio.note.freeHeading")}</span>
                            {(
                              [
                                [t("studio.note.line1Placeholder"), t("studio.note.line1Aria"), noteLine1, setNoteLine1, noteL1, setNoteL1],
                                [t("studio.note.line2Placeholder"), t("studio.note.line2Aria"), noteLine2, setNoteLine2, noteL2, setNoteL2],
                              ] as [string, string, string, (v: string) => void, NoteLineStyle, (v: NoteLineStyle) => void][]
                            ).map(([ph, aria, text, setText, st, setSt]) => (
                              <div key={aria}>
                                <input
                                  type="text"
                                  className="studio-data-input"
                                  value={text}
                                  onChange={(e) => setText(e.target.value)}
                                  placeholder={ph}
                                  aria-label={aria}
                                  autoComplete="off"
                                />
                                <div className="seg ar-note-line-style" role="group" aria-label={t("studio.note.lineStyleAria", { label: aria })}>
                                  <button className={st.bold ? "is-active" : ""} onClick={() => setSt({ ...st, bold: !st.bold })}>{t("studio.note.bold")}</button>
                                  <button className={st.italic ? "is-active" : ""} onClick={() => setSt({ ...st, italic: !st.italic })}>{t("studio.note.italic")}</button>
                                  <button className={st.dim ? "is-active" : ""} onClick={() => setSt({ ...st, dim: !st.dim })}>{t("studio.note.dim")}</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </section>
                )}
              </div>
              </>
            )}

            {/* 書き出し（常時表示の下部バー） */}
            <div className="studio-panel-foot">
              <button className="ar-btn-sub" onClick={() => setExportView("template")} title={t("studio.export.themeTabTitle")}>
                <IconChevron dir="left" size={14} />
                {t("studio.export.themeTab")}
              </button>
              <button className="ar-btn-sub" onClick={exitToBoard} title={t("studio.export.toBoardTitle")}>
                {t("studio.common.toBoard")}
              </button>
              <button className="ar-btn-main" onClick={openExportPreview} disabled={previewBaking}>
                <IconDownload size={15} />
                {previewBaking ? t("studio.export.generating") : t("studio.export.exportCta")}
              </button>
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
