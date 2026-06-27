import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconDownload, IconCaret, IconHome, IconMountain, IconInfo } from "./icons";
import type { ArLabel } from "../lib/labels";

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
// 余白の色を写真の縁から動的に決める（夕焼け＝橙寄り・青空＝水色寄り。「空」「間」テンプレ向け）。
const samplePhotoEdgeColor = async (
  url: string,
  crop: { l: number; t: number; r: number; b: number },
  margin: { t: number; r: number; b: number; l: number },
): Promise<string | null> => {
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
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
const isDarkColor = (hex: string): boolean => {
  const [r, g, b] = hexToRgb(hex).split(",").map(Number);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
};
const contrastShadow = (textColor: string, dark = 0.82): string =>
  isDarkColor(textColor) ? "rgba(255,255,255,0.5)" : `rgba(0,0,0,${dark})`;
const tagBg = (textColor: string): string =>
  isDarkColor(textColor) ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.4)";

type BgPanel = "none" | "translucent";
const panelFill = (textColor: string) =>
  isDarkColor(textColor) ? "rgba(255,255,255,0.55)" : "rgba(17,21,29,0.42)";
const panelStroke = (textColor: string) => (isDarkColor(textColor) ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.14)");

// ふち（フェード）の S字イージング停止点。t=0(縁,不透明)→t=1(内側,透明)。
const FADE_STOPS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map((t) => ({
  t,
  a: 1 - (3 * t * t - 2 * t * t * t),
}));

// ラベルの内容パターン（1段目=主名／2段目=補足の組み合わせ）。
type LabelMode = "jaSubEnElev" | "jaSubEn" | "jaSubElev" | "enSubElev" | "jaOnly" | "enOnly";

// 焼き込み文字の役割（サイズ・フォントを役割ごとに設定する単位）。
type FontRole = "labelName" | "labelSub" | "captionTitle" | "captionBody";
type FontPairId = "gothic" | "roundedGothic" | "modernGothic" | "mincho" | "posterMincho" | "brush";
type FontPair = { label: string; jp: string; en: string; description: string };
type RoleFonts = Record<FontRole, FontPairId>;

// 選べるフォントペア（和文＋欧文のセット。index.html で Google Fonts を読み込み）。
const FONT_PAIRS: Record<FontPairId, FontPair> = {
  gothic: { label: "ゴシック", jp: "Noto Sans JP", en: "Inter", description: "読みやすい標準フォント。本文・ラベル・注記向き。" },
  roundedGothic: { label: "丸ゴシック", jp: "M PLUS Rounded 1c", en: "Nunito", description: "丸みがあり、やさしく親しみやすい雰囲気。" },
  modernGothic: { label: "モダンゴシック", jp: "Zen Kaku Gothic New", en: "Montserrat", description: "現代的で力強い。カードUIや大きめタイトル向き。" },
  mincho: { label: "明朝", jp: "Noto Serif JP", en: "Noto Serif", description: "上品で落ち着いた雰囲気。観光ガイド風。" },
  posterMincho: { label: "ポスター明朝", jp: "Shippori Mincho", en: "Cormorant Garamond", description: "雑誌・ポスター風の高級感。共有画像のタイトル向き。" },
  brush: { label: "筆文字", jp: "Yuji Syuku", en: "Great Vibes", description: "和風で印象的。タイトル専用向き。" },
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

// 仕上げのテンプレート。選ぶと「見た目＋構図」をまとめて適用する値の束。
type ExportStyle = {
  bakeLabels: boolean;
  labelMode: LabelMode;
  labelBg: BgPanel;
  labelColor: string;
  labelShadow: boolean;
  labelNameScale: number;
  labelSubScale: number;
  captionLang: "ja" | "en" | "both" | "none";
  captionLayout: "horizontal" | "vertical";
  captionTitleMode: "each" | "groupV" | "groupH" | "ja" | "en";
  captionLength: "long" | "short";
  captionBg: BgPanel;
  captionColor: string;
  captionShadow: boolean;
  captionTitleScale: number;
  captionBodyScale: number;
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
  titleColor: string;
  titleShadow: boolean;
  titleFont: FontPairId;
  titlePos: { u: number; v: number };
  roleFonts: RoleFonts;
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
  labelColor: "#ffffff",
  labelShadow: true,
  labelNameScale: 1,
  labelSubScale: 1,
  captionLang: "none",
  captionLayout: "horizontal",
  captionTitleMode: "each",
  captionLength: "short",
  captionBg: "none",
  captionColor: "#ffffff",
  captionShadow: true,
  captionTitleScale: 1,
  captionBodyScale: 1,
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
  titlePos: { u: 0.5, v: 0.44 },
  roleFonts: DEFAULT_ROLE_FONTS,
  frameMargin: NO_MARGIN,
  frameMarginColor: "#ffffff",
  frameMarginAuto: false,
  cropInset: NO_CROP,
  frameFade: 0,
};
// テンプレートは「図(zu)」=3Dミニマップ入りを除いた6種。
const EXPORT_TEMPLATES: ExportTemplate[] = [
  {
    id: "miyabi",
    name: "雅",
    sub: "定番・山名入り",
    hint: "明朝の山名で上品に。名前・英語名・標高を添える定番。",
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
    sub: "センタータイトル",
    hint: "写真中央に大きな山名を据えるポスター風。小見出し・標高を添える。",
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
    id: "shiori",
    name: "栞",
    sub: "英語解説",
    hint: "名札は出さず、選んだ山の解説を英語で添える読み物風。",
    style: {
      ...BASE_STYLE,
      bakeLabels: false,
      labelMode: "jaSubEnElev",
      labelNameScale: 1.2,
      labelSubScale: 0.85,
      captionLang: "en",
      captionLength: "long",
      captionBg: "translucent",
      captionTitleScale: 1.4,
      captionBodyScale: 0.85,
      captionPos: { u: 0.051, v: 0.704 },
      roleFonts: { labelName: "posterMincho", labelSub: "mincho", captionTitle: "modernGothic", captionBody: "gothic" },
    },
  },
  {
    id: "sou",
    name: "双",
    sub: "日英併記",
    hint: "日本語と英語を併記。パネルなしで解説を見せる見開き風。",
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
    sub: "余白を活かす",
    hint: "左に余白をとり、写真を細く切り出した縦組みの作品。",
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
    sub: "縦構図・余白",
    hint: "上に空色の大きな余白をとり、写真へやわらかく溶かす。",
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

type StudioProps = {
  photoUrl: string;
  initialLabels: ArLabel[];
  onBack: () => void;
};

export default function Studio({ photoUrl, initialLabels, onBack }: StudioProps) {
  // 仕上げ画面の表示モード。入った直後はテンプレ選択、選ぶと編集へ。
  const [exportView, setExportView] = useState<"template" | "edit">("template");
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  // 編集対象の山ラベル（入口で組み立て済み）。座標は写真フレーム内の正規化値(0..1)。
  const [arLabels, setArLabels] = useState<ArLabel[]>(initialLabels);
  // 下部キャプション・センタータイトルで取り上げる山（arLabels 内の index）。
  const [captionIdx, setCaptionIdx] = useState(() => {
    const i = initialLabels.findIndex((l) => l.description);
    return i >= 0 ? i : 0;
  });

  // --- 山名ラベル --- //
  const [bakeLabels, setBakeLabels] = useState(true);
  const [labelMode, setLabelMode] = useState<LabelMode>("jaSubEnElev");
  const [labelColor, setLabelColor] = useState("#ffffff");
  const [labelShadow, setLabelShadow] = useState(true);
  const [labelBg, setLabelBg] = useState<BgPanel>("none");
  const [labelNameScale, setLabelNameScale] = useState(1);
  const [labelSubScale, setLabelSubScale] = useState(1);
  const labelHasSub = labelMode !== "jaOnly" && labelMode !== "enOnly";

  // --- 解説（キャプション） --- //
  const [captionLang, setCaptionLang] = useState<"ja" | "en" | "both" | "none">("none");
  const [captionLayout, setCaptionLayout] = useState<"horizontal" | "vertical">("horizontal");
  const [captionTitleMode, setCaptionTitleMode] = useState<"each" | "groupV" | "groupH" | "ja" | "en">("each");
  const [captionLength, setCaptionLength] = useState<"long" | "short">("long");
  const [captionBg, setCaptionBg] = useState<BgPanel>("none");
  const [captionColor, setCaptionColor] = useState("#ffffff");
  const [captionShadow, setCaptionShadow] = useState(true);
  const [captionTitleScale, setCaptionTitleScale] = useState(1);
  const [captionBodyScale, setCaptionBodyScale] = useState(1);
  const [captionPos, setCaptionPos] = useState({ u: 0.05, v: 0.62 });
  const [captionW, setCaptionW] = useState(0.55);
  const [captionSplit, setCaptionSplit] = useState(0.5);

  // --- タグ（ピル） --- //
  const [tagColor, setTagColor] = useState(GOLD);
  const [tagColorTarget, setTagColorTarget] = useState<"bg" | "text">("bg");
  const [capShowElev, setCapShowElev] = useState(false);
  const [capShowLoc, setCapShowLoc] = useState(false);
  const [capSelectedTags, setCapSelectedTags] = useState<string[]>([]);
  const toggleCapTag = (t: string) =>
    setCapSelectedTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  // --- センタータイトル（ポスター風） --- //
  const [titleOn, setTitleOn] = useState(false);
  const [titleLang, setTitleLang] = useState<"en" | "ja">("en");
  const [titleShowOver, setTitleShowOver] = useState(true);
  const [titleShowNum, setTitleShowNum] = useState(true);
  const [titleScale, setTitleScale] = useState(1);
  const [titleColor, setTitleColor] = useState("#ffffff");
  const [titleShadow, setTitleShadow] = useState(true);
  const [titleFont, setTitleFont] = useState<FontPairId>("posterMincho");
  const [titlePos, setTitlePos] = useState({ u: 0.5, v: 0.44 });
  const titleDragRef = useRef<{ offU: number; offV: number } | null>(null);

  // --- フォント（役割ごと） --- //
  const [roleFonts, setRoleFonts] = useState<RoleFonts>(DEFAULT_ROLE_FONTS);
  const setRoleFont = (role: FontRole, value: FontPairId) => setRoleFonts((p) => ({ ...p, [role]: value }));

  // --- フレーム（切り抜き・余白・ふち） --- //
  const [cropInset, setCropInset] = useState({ l: 0, t: 0, r: 0, b: 0 });
  const [frameMargin, setFrameMargin] = useState({ t: 0, r: 0, b: 0, l: 0 });
  const [frameMarginColor, setFrameMarginColor] = useState("#ffffff");
  const [frameMarginAuto, setFrameMarginAuto] = useState(false);
  const [frameFade, setFrameFade] = useState(0);

  // --- 書き出し --- //
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewBaking, setPreviewBaking] = useState(false);
  const [styleDump, setStyleDump] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  // --- 計測・ドラッグ --- //
  const [photoNat, setPhotoNat] = useState<{ w: number; h: number } | null>(null);
  const [labelBoxes, setLabelBoxes] = useState<Record<number, { w: number; h: number }>>({});
  const [labelFramePad, setLabelFramePad] = useState<{ h: number; v: number }>({ h: 0, v: 0 });
  const [measureTick, setMeasureTick] = useState(0);
  const arEditStageRef = useRef<HTMLDivElement | null>(null);
  const arFrameRef = useRef<HTMLDivElement | null>(null);
  const captionDragRef = useRef<{ offU: number; offV: number } | null>(null);
  const capResizeRef = useRef<{ side: "l" | "r" | "t" | "b"; startW: number; startV: number; boxLeft: number; boxRight: number } | null>(null);
  const arDragRef = useRef<{ i: number; kind: "dot" | "label" | "labelAnchor" | "caption" | "capResize" | "capSplit" | "title" } | null>(null);

  // 選択中の長さに応じた解説本文（短めが無ければ長めにフォールバック）。
  const descJa = (lb: { description?: string; descriptionShort?: string }) =>
    captionLength === "short" ? lb.descriptionShort || lb.description : lb.description;
  const descEn = (lb: { descriptionEn?: string; descriptionEnShort?: string }) =>
    captionLength === "short" ? lb.descriptionEnShort || lb.descriptionEn : lb.descriptionEn;

  // 指定言語のチップ文字列（高さ→場所→選択タグの順）。
  const capChips = (lb: ArLabel, lang: "ja" | "en"): string[] => {
    const chips: string[] = [];
    if (capShowElev) chips.push(`${Math.round(lb.elevM).toLocaleString()}m`);
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
  const capBoth = captionLang === "both" && !!capItem?.description && !!capItem?.descriptionEn;
  const capName = capItem?.name ?? "";
  const capNameEn = capItem?.nameEn || capItem?.name || "";
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
    const main = up(en ? it.nameEn || it.name : it.name);
    const over =
      titleShowOver && it.prefecture
        ? up(en ? prefEn(it.prefecture) : it.prefecture.replace(/\//g, "・"))
        : "";
    const num = titleShowNum ? `${Math.round(it.elevM).toLocaleString()} ${en ? "M" : "m"}` : "";
    return { over, main, num };
  };

  // ラベルの1段目(name)と2段目(sub)の文字列を labelMode から決める。
  const labelContent = (lb: { name: string; nameEn?: string; elevM: number }) => {
    const ja = lb.name;
    const en = lb.nameEn || lb.name;
    const elev = `${Math.round(lb.elevM).toLocaleString()}m`;
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
        return { name: ja, sub: en };
      default:
        return { name: ja, sub: `${lb.nameEn ? lb.nameEn + " | " : ""}${elev}` };
    }
  };

  // タグ（ピル）の塗り分け。
  const pillColors = () =>
    tagColorTarget === "bg"
      ? { bg: tagColor, fg: isDarkColor(tagColor) ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.85)" }
      : { bg: tagBg(tagColor), fg: tagColor };

  // 役割のフォント選択行。
  const fontRow = (role: FontRole, label: string) => (
    <>
      <div className="ar-fs-row">
        <span>{label}</span>
        <div className="ar-font-sel">
          <select value={roleFonts[role]} onChange={(e) => setRoleFont(role, e.target.value as FontPairId)} aria-label={label}>
            {FONT_PAIR_IDS.map((id) => (
              <option key={id} value={id} title={FONT_PAIRS[id].description}>
                {FONT_PAIRS[id].label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="ar-font-desc">{FONT_PAIRS[roleFonts[role]].description}</p>
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
  useLayoutEffect(() => {
    const stageEl = arEditStageRef.current, frame = arFrameRef.current;
    if (!stageEl || !frame) return;
    const sw = stageEl.clientWidth, sh = stageEl.clientHeight;
    if (!sw || !sh || !frameAR) return;
    let w = sw, h = sw / frameAR;
    if (h > sh) {
      h = sh;
      w = sh * frameAR;
    }
    frame.style.width = `${Math.round(w)}px`;
    frame.style.height = `${Math.round(h)}px`;
  }, [frameAR, measureTick, exportView]);

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
  }, [arLabels, labelMode, labelNameScale, labelSubScale, roleFonts, bakeLabels, exportView, measureTick]);

  // ステージのサイズ変化時に再計測。
  useEffect(() => {
    const stage = arEditStageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setMeasureTick((t) => t + 1));
    ro.observe(stage);
    return () => ro.disconnect();
  }, [exportView]);

  // ============================ 焼き込み（Canvas 2D） ============================ //
  const bakeComposite = async (): Promise<{ url: string; blob: Blob | null } | null> => {
    const img = new Image();
    img.src = photoUrl;
    await img.decode();
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
    // iOS(WebKit)は Canvas の最大ピクセル面積に上限があり、高解像度写真＋大きな余白で
    // 上限を超えると書き出しが真っ白になる。出力長辺を OUT_CAP に収めるよう自動縮小する。
    const OUT_CAP = 4096;
    const outScale = Math.min(1, OUT_CAP / Math.max(OW, OH));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(OW * outScale));
    canvas.height = Math.max(1, Math.round(OH * outScale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // 以降の描画は論理座標(OW×OH)のまま行い、物理キャンバスへ一括縮小して載せる。
    ctx.scale(outScale, outScale);
    if (mT || mB || mL || mR) {
      ctx.fillStyle = frameMarginColor;
      ctx.fillRect(0, 0, OW, OH);
    }
    ctx.drawImage(img, cl, ct, cw, ch, mL, mT, cwR, chR);
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
    const drawPanel = (x: number, y: number, w: number, h: number, r: number, textColor: string) => {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.26)";
      ctx.shadowBlur = Math.round(L * 0.012);
      ctx.shadowOffsetY = Math.round(L * 0.0045);
      ctx.fillStyle = panelFill(textColor);
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.lineWidth = Math.max(1, Math.round(L * 0.0009));
      ctx.strokeStyle = panelStroke(textColor);
      ctx.stroke();
      ctx.restore();
    };
    const fontLoads: Promise<unknown>[] = [];
    for (const [w, id] of [
      [700, roleFonts.labelName],
      [500, roleFonts.labelSub],
      [700, roleFonts.captionTitle],
      [400, roleFonts.captionBody],
    ] as [number, FontPairId][]) {
      const p = FONT_PAIRS[id];
      fontLoads.push(document.fonts.load(`${w} 16px "${p.jp}"`).catch(() => {}));
      fontLoads.push(document.fonts.load(`${w} 16px "${p.en}"`).catch(() => {}));
    }
    await Promise.all(fontLoads);
    ctx.textBaseline = "alphabetic";
    if (bakeLabels) {
      for (const lb of arLabels) {
        const dotX = pfx(lb.dotU);
        const dotY = pfy(lb.dotV);
        const cx = pfx(lb.labelU);
        const cy = pfy(lb.labelV);
        const { name, sub } = labelContent(lb);
        const subBaseline = cy;
        const nameBaseline = sub ? cy - Math.round(subFs * 1.35) : cy;
        ctx.font = `700 ${nameFs}px ${ffName}`;
        const nameW = ctx.measureText(name).width;
        let subW = 0;
        if (sub) {
          ctx.font = `500 ${subFs}px ${ffSub}`;
          subW = ctx.measureText(sub).width;
        }
        const boxW = Math.max(nameW, subW);
        const boxTop = nameBaseline - nameFs;
        const boxBottom = cy;
        const boxMidY = (boxTop + boxBottom) / 2;
        const anchor = lb.labelAnchor ?? "bottom";
        const padH = L * 0.012, padV = L * 0.008;
        const ax = anchor === "left" ? cx - boxW / 2 - padH : anchor === "right" ? cx + boxW / 2 + padH : cx;
        const ay = anchor === "top" ? boxTop - padV : anchor === "bottom" ? boxBottom + padV : boxMidY;
        const bx = dotX, by = dotY;
        ctx.strokeStyle = labelColor;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = Math.max(1, L * 0.0022);
        ctx.beginPath();
        ctx.moveTo(ax + (bx - ax) * 0.17, ay + (by - ay) * 0.17);
        ctx.lineTo(ax + (bx - ax) * 0.83, ay + (by - ay) * 0.83);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (labelBg !== "none") {
          drawPanel(cx - boxW / 2 - padH, boxTop - padV, boxW + padH * 2, boxBottom - boxTop + padV * 2, Math.round(L * 0.011), labelColor);
        }
        ctx.save();
        if (labelShadow) {
          ctx.shadowColor = contrastShadow(labelColor);
          ctx.shadowBlur = Math.round(L * 0.0035);
          ctx.shadowOffsetY = Math.max(1, Math.round(L * 0.001));
        }
        ctx.textAlign = "center";
        ctx.fillStyle = labelColor;
        ctx.font = `700 ${nameFs}px ${ffName}`;
        ctx.fillText(name, cx, nameBaseline);
        if (sub) {
          ctx.font = `500 ${subFs}px ${ffSub}`;
          ctx.fillText(sub, cx, subBaseline);
        }
        ctx.restore();
      }
    }

    // 解説（可動ブロック）。
    const cap = arLabels[captionIdx];
    const capJa = cap ? descJa(cap) : undefined;
    const capEn = cap ? descEn(cap) : undefined;
    if (captionLang !== "none" && cap && (capJa || capEn)) {
      const cols: { title: string; body: string; lang: "ja" | "en" }[] = [];
      if ((captionLang === "ja" || captionLang === "both") && capJa)
        cols.push({ title: cap.name, body: capJa, lang: "ja" });
      if ((captionLang === "en" || captionLang === "both") && capEn)
        cols.push({ title: cap.nameEn || cap.name, body: capEn, lang: "en" });
      if (cols.length) {
        const titleFs = Math.round(L * 0.026 * captionTitleScale);
        const bodyFs = Math.round(L * 0.02 * captionBodyScale);
        const titleLineH = Math.round(titleFs * 1.3);
        const lineH = Math.round(bodyFs * 1.5);
        const blockW = Math.round(OW * captionW);
        const colGap = Math.round(OW * 0.035);
        const vertical = captionLayout === "vertical" && cols.length > 1;
        const colWidths = vertical
          ? cols.map(() => blockW)
          : cols.length > 1
            ? [Math.round((blockW - colGap) * captionSplit), blockW - colGap - Math.round((blockW - colGap) * captionSplit)]
            : [blockW];
        ctx.textAlign = "left";
        const isCjk = (ch: string) => /[　-ヿ㐀-䶿一-鿿＀-￯]/.test(ch);
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
          ctx.font = `400 ${bodyFs}px ${ffBody}`;
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
        const colBodyH = wrapped.map((w, ci) => (colHasTitle ? titleLineH : 0) + colTagH[ci] + w.lines.length * lineH);
        const sharedTitleH = sharedParts.length
          ? sharedRow
            ? lineHFor(Math.max(...sharedParts.map((p) => p.fs)))
            : sharedParts.reduce((a, p) => a + lineHFor(p.fs), 0)
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
          drawPanel(bx - px, by - py, blockW + px * 2, bodyBlockH + py * 2, Math.round(L * 0.016), captionColor);
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
            ctx.font = `700 ${titleFs}px ${ffTitle}`;
            ctx.fillText(w.title, cxp, ty2 + titleFs);
            ty2 += titleLineH;
          }
          if (colHasTitle && colTagRows[ci].length) {
            ty2 += capGap;
            drawPills(colTagRows[ci], cxp, ty2);
            ty2 += pillsH(colTagRows[ci]) + capGap;
          }
          ctx.fillStyle = captionColor;
          ctx.font = `400 ${bodyFs}px ${ffBody}`;
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
                ctx.font = `700 ${baseFs}px ${ffTitle}`;
                cxp += gap;
                ctx.globalAlpha = 0.7;
                ctx.fillText("/", cxp, baseline);
                ctx.globalAlpha = 1;
                cxp += ctx.measureText("/").width + gap;
              }
              ctx.font = `700 ${p.fs}px ${ffTitle}`;
              ctx.fillText(p.text, cxp, baseline);
              cxp += ctx.measureText(p.text).width;
            });
            ty += lineHFor(baseFs);
          } else {
            for (const p of sharedParts) {
              ctx.font = `700 ${p.fs}px ${ffTitle}`;
              ctx.fillText(p.text, bx, ty + p.fs);
              ty += lineHFor(p.fs);
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
        await Promise.all([
          document.fonts.load(`700 16px "${p.jp}"`).catch(() => {}),
          document.fonts.load(`700 16px "${p.en}"`).catch(() => {}),
          document.fonts.load(`500 16px "${p.jp}"`).catch(() => {}),
          document.fonts.load(`500 16px "${p.en}"`).catch(() => {}),
        ]);
        const mainFs = Math.round(L * 0.075 * titleScale);
        const overFs = Math.max(1, Math.round(mainFs * 0.26));
        const numFs = Math.max(1, Math.round(mainFs * 0.3));
        const overGap = Math.round(mainFs * 0.42);
        const numGap = Math.round(mainFs * 0.34);
        const totalH = (tp.over ? overFs + overGap : 0) + mainFs + (tp.num ? numGap + numFs : 0);
        let y = cy - totalH / 2;
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = titleColor;
        if (titleShadow) {
          ctx.shadowColor = contrastShadow(titleColor);
          ctx.shadowBlur = Math.round(L * 0.006);
          ctx.shadowOffsetY = Math.max(1, Math.round(L * 0.0015));
        }
        const setLS = (px: number) => {
          (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${px}px`;
        };
        if (tp.over) {
          ctx.font = `500 ${overFs}px ${ffTitle}`;
          setLS(overFs * 0.35);
          ctx.fillText(tp.over, cx, y);
          y += overFs + overGap;
        }
        ctx.font = `700 ${mainFs}px ${ffTitle}`;
        setLS(mainFs * 0.04);
        ctx.fillText(tp.main, cx, y);
        y += mainFs;
        if (tp.num) {
          y += numGap;
          ctx.font = `500 ${numFs}px ${ffTitle}`;
          setLS(numFs * 0.3);
          ctx.fillText(tp.num, cx, y);
        }
        setLS(0);
        ctx.restore();
      }
    }
    const url = canvas.toDataURL("image/jpeg", 0.92);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    return { url, blob };
  };

  // テンプレートの値束を各 state に一括反映し、編集画面へ。
  const applyTemplate = (t: ExportTemplate) => {
    const ar = photoNat ? photoNat.w / photoNat.h : 1;
    const s = orientStyle(t, ar < 1);
    setBakeLabels(s.bakeLabels);
    setLabelMode(s.labelMode);
    setLabelBg(s.labelBg);
    setLabelColor(s.labelColor);
    setLabelShadow(s.labelShadow);
    setLabelNameScale(s.labelNameScale);
    setLabelSubScale(s.labelSubScale);
    setCaptionLang(s.captionLang);
    setCaptionLayout(s.captionLayout);
    setCaptionTitleMode(s.captionTitleMode);
    setCaptionLength(s.captionLength);
    setCaptionBg(s.captionBg);
    setCaptionColor(s.captionColor);
    setCaptionShadow(s.captionShadow);
    setCaptionTitleScale(s.captionTitleScale);
    setCaptionBodyScale(s.captionBodyScale);
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
    setTitleColor(s.titleColor);
    setTitleShadow(s.titleShadow);
    setTitleFont(s.titleFont);
    setTitlePos(s.titlePos);
    setRoleFonts(s.roleFonts);
    setFrameMargin(s.frameMargin);
    setFrameMarginColor(s.frameMarginColor);
    setFrameMarginAuto(s.frameMarginAuto);
    setCropInset(s.cropInset);
    setFrameFade(s.frameFade);
    setActiveTemplateId(t.id);
    setExportView("edit");
  };

  // 現在の仕上げ設定を ExportStyle 形式の JSON で書き出す（位置は写真依存なので含めない）。
  const dumpCurrentStyle = () => {
    const style: ExportStyle = {
      bakeLabels, labelMode, labelBg, labelColor, labelShadow, labelNameScale, labelSubScale,
      captionLang, captionLayout, captionTitleMode, captionLength, captionBg, captionColor, captionShadow,
      captionTitleScale, captionBodyScale, captionPos, captionW, captionSplit,
      tagColor, tagColorTarget, capShowElev, capShowLoc, capSelectedTags,
      titleOn, titleLang, titleShowOver, titleShowNum, titleScale, titleColor, titleShadow, titleFont, titlePos,
      roleFonts, frameMargin, frameMarginColor, frameMarginAuto, cropInset, frameFade,
    };
    const json = JSON.stringify(style, null, 2);
    setStyleDump(json);
    navigator.clipboard?.writeText(json).catch(() => {});
  };

  const openExportPreview = async () => {
    if (previewBaking) return;
    setPreviewBaking(true);
    const r = await bakeComposite();
    setPreviewBaking(false);
    if (r) {
      setPreviewUrl(r.url);
      setPreviewBlob(r.blob);
    }
  };
  // 保存。iOS(WebKit)は <a download> が効かないことが多いので、まず Web Share API
  // （「"写真"に保存」/共有が出せる）を試し、未対応環境では従来のダウンロードへフォールバック。
  const saveExportImage = async () => {
    const file = previewBlob ? new File([previewBlob], "frame.jpg", { type: "image/jpeg" }) : null;
    if (file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "frame" });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return; // ユーザーがキャンセル
        // それ以外（共有失敗）はダウンロードへフォールバック
      }
    }
    const href = previewBlob ? URL.createObjectURL(previewBlob) : previewUrl;
    if (!href) return;
    const a = document.createElement("a");
    a.href = href;
    a.download = "frame.jpg";
    a.click();
    if (previewBlob) window.setTimeout(() => URL.revokeObjectURL(href), 1000);
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
      const pu = (e.clientX - r.left) / r.width;
      const pv = (e.clientY - r.top) / r.height;
      const cf = photoToFrame(captionPos.u, captionPos.v);
      captionDragRef.current = { offU: pu - cf.u, offV: pv - cf.v };
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
      const pu = (e.clientX - r.left) / r.width;
      const pv = (e.clientY - r.top) / r.height;
      const tf = photoToFrame(titlePos.u, titlePos.v);
      titleDragRef.current = { offU: pu - tf.u, offV: pv - tf.v };
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
    const r = stage.getBoundingClientRect();
    const u = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    if (d.kind === "caption") {
      const off = captionDragRef.current ?? { offU: 0, offV: 0 };
      const maxU = Math.max(0, 1 - captionW);
      const fU = Math.min(maxU, Math.max(0, u - off.offU));
      const fV = Math.min(0.82, Math.max(0, v - off.offV));
      setCaptionPos(frameToPhoto(fU, fV));
      return;
    }
    if (d.kind === "title") {
      const off = titleDragRef.current ?? { offU: 0, offV: 0 };
      const fU = Math.min(1, Math.max(0, u - off.offU));
      const fV = Math.min(1, Math.max(0, v - off.offV));
      setTitlePos(frameToPhoto(fU, fV));
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
    const p = frameToPhoto(u, v);
    setArLabels((prev) =>
      prev.map((lb, idx) =>
        idx !== d.i ? lb : d.kind === "dot" ? { ...lb, dotU: p.u, dotV: p.v } : { ...lb, labelU: p.u, labelV: p.v },
      ),
    );
  };
  const onEditUp = () => {
    arDragRef.current = null;
  };

  // ============================ 描画 ============================ //
  const capItemTags = capItem?.tagsJa ?? [];

  return (
    <div className="studio">
      {/* テンプレ選択 */}
      {exportView === "template" && (
        <div className="ar-tpl">
          <div className="ar-tpl-inner">
            <header className="home-head ar-tpl-head">
              <h1>テンプレートを選ぶ</h1>
              <p>雰囲気を選ぶと、文字・解説・余白をまとめて整えます。あとから細かく調整できます。</p>
            </header>
            <div className="ar-tpl-grid">
              {EXPORT_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`ar-tpl-card${activeTemplateId === t.id ? " is-active" : ""}`}
                  onClick={() => applyTemplate(t)}
                >
                  <span className="ar-tpl-thumb">
                    <img
                      src={`${import.meta.env.BASE_URL}template-previews/${t.id}.jpg`}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                    {activeTemplateId === t.id && <span className="ar-tpl-check" aria-hidden="true">✓</span>}
                  </span>
                  <span className="ar-tpl-card-body">
                    <span className="ar-tpl-card-head">
                      <span className="ar-tpl-card-name">{t.name}</span>
                      <span className="ar-tpl-card-sub">{t.sub}</span>
                    </span>
                    <span className="ar-tpl-card-hint">{t.hint}</span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                className="ar-tpl-card ar-tpl-card--custom"
                onClick={() => setExportView("edit")}
              >
                <span className="ar-tpl-thumb ar-tpl-thumb--custom">自分で</span>
                <span className="ar-tpl-card-body">
                  <span className="ar-tpl-card-name">自分で設定</span>
                  <span className="ar-tpl-card-hint">テンプレートを使わず、最初から自分で仕上げる。</span>
                </span>
              </button>
            </div>
            <div className="ar-tpl-foot">
              <button className="ar-btn-sub" onClick={onBack}>山・写真を選び直す</button>
            </div>
          </div>
        </div>
      )}

      {/* 設定JSON ダンプ */}
      {styleDump !== null && (
        <div className="ar-dump" onClick={() => setStyleDump(null)}>
          <div className="ar-dump-card" onClick={(e) => e.stopPropagation()}>
            <div className="ar-dump-head">
              <span>現在の設定（ExportStyle JSON）</span>
              <span className="ar-dump-note">クリップボードにコピー済み。これを貼って共有してください。</span>
            </div>
            <textarea className="ar-dump-text" readOnly value={styleDump} onFocus={(e) => e.currentTarget.select()} />
            <div className="ar-dump-actions">
              <button className="ar-btn-sub" onClick={() => navigator.clipboard?.writeText(styleDump).catch(() => {})}>
                もう一度コピー
              </button>
              <button className="ar-btn-main" onClick={() => setStyleDump(null)}>閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* 書き出しプレビュー */}
      {previewUrl !== null && (
        <div className="ar-preview" onClick={() => setPreviewUrl(null)}>
          <div className="ar-preview-card" onClick={(e) => e.stopPropagation()}>
            <div className="ar-preview-head">
              <span>書き出しプレビュー</span>
              <span className="ar-preview-note">この内容で保存します。よければダウンロードしてください。</span>
            </div>
            <div className="ar-preview-body">
              <img src={previewUrl} alt="書き出しプレビュー" />
            </div>
            <p className="studio-save-hint">保存できないときは、上の画像を長押しして「&quot;写真&quot;に保存」も使えます。</p>
            <div className="ar-preview-actions">
              <button className="ar-btn-sub" onClick={() => setPreviewUrl(null)}>もどる</button>
              <button className="ar-btn-main" onClick={saveExportImage}>
                <IconDownload size={15} />
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編集 */}
      {exportView === "edit" && (
        <div className="ar-edit studio-edit">
          <div className="ar-edit-stage studio-stage" ref={arEditStageRef}>
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
              {/* 山名ラベル */}
              {bakeLabels && (
                <>
                  <svg className="ar-edit-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {arLabels.map((lb, i) => {
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
                          stroke={labelColor}
                          strokeOpacity={0.9}
                          strokeWidth={1.2}
                          vectorEffect="non-scaling-stroke"
                        />
                      );
                    })}
                  </svg>
                  <div className="ar-edit-chrome">
                    <svg className="ar-edit-guides" viewBox="0 0 100 100" preserveAspectRatio="none">
                      {arLabels.map((lb, i) => {
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
                          />
                          <div
                            className="ar-edit-dot ar-edit-anchor"
                            style={{ left: `${sp.x * 100}%`, top: `${sp.y * 100}%` }}
                            onPointerDown={onEditDown(i, "labelAnchor")}
                            onPointerMove={onEditMove}
                            onPointerUp={onEditUp}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {arLabels.map((lb, i) => {
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
                            color: labelColor,
                            "--label-sh": labelShadow ? contrastShadow(labelColor) : "transparent",
                            ...(labelBg !== "none"
                              ? {
                                  "--label-panel-bg": panelFill(labelColor),
                                  "--label-panel-bd": panelStroke(labelColor),
                                }
                              : {}),
                          } as React.CSSProperties
                        }
                        onPointerDown={onEditDown(i, "label")}
                        onPointerMove={onEditMove}
                        onPointerUp={onEditUp}
                      >
                        <span className="ar-label-name">{lc.name}</span>
                        {lc.sub && <span className="ar-label-sub">{lc.sub}</span>}
                      </div>
                    );
                  })}
                </>
              )}
              {/* 解説 */}
              {captionLang !== "none" &&
                arLabels[captionIdx] &&
                (arLabels[captionIdx].description || arLabels[captionIdx].descriptionEn) && (
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
                        ...(captionBg !== "none"
                          ? {
                              "--cap-panel-bg": panelFill(captionColor),
                              "--cap-panel-bd": panelStroke(captionColor),
                            }
                          : {}),
                      } as React.CSSProperties
                    }
                    onPointerDown={onCaptionDown}
                    onPointerMove={onEditMove}
                    onPointerUp={onEditUp}
                  >
                    {capSharedTitleParts.length > 0 && (
                      <div
                        className={`ar-cap-shared${capSharedRow ? " is-row" : ""}${capSharedHasTags ? " has-tags" : ""}`}
                        style={capSharedRow ? ({ "--cap-sub-ratio": 0.8 } as React.CSSProperties) : undefined}
                      >
                        {capSharedRow ? (
                          <>
                            <div className="ar-caption-title">{capName}</div>
                            <div className="ar-caption-title ar-cap-sep">/</div>
                            <div className="ar-caption-title is-sub">{capNameEn}</div>
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
                      {(captionLang === "ja" || captionLang === "both") && arLabels[captionIdx].description && (
                        <div
                          className="ar-cap-col"
                          style={capBoth && captionLayout === "horizontal" ? { flex: `${captionSplit} 1 0` } : undefined}
                        >
                          {capColHasTitle && <div className="ar-caption-title">{arLabels[captionIdx].name}</div>}
                          {capColHasTitle && !capBoth && capTagEls(capTagLang)}
                          <p className="ar-caption-text">{descJa(arLabels[captionIdx])}</p>
                        </div>
                      )}
                      {capBoth && captionLayout === "horizontal" && (
                        <div
                          className="ar-cap-divider"
                          title="日英の境界を動かす"
                          onPointerDown={onCapSplitDown}
                          onPointerMove={onEditMove}
                          onPointerUp={onEditUp}
                        />
                      )}
                      {(captionLang === "en" || captionLang === "both") && arLabels[captionIdx].descriptionEn && (
                        <div
                          className="ar-cap-col"
                          style={capBoth && captionLayout === "horizontal" ? { flex: `${1 - captionSplit} 1 0` } : undefined}
                        >
                          {capColHasTitle && <div className="ar-caption-title">{arLabels[captionIdx].nameEn || arLabels[captionIdx].name}</div>}
                          {capColHasTitle && !capBoth && capTagEls(capTagLang)}
                          <p className="ar-caption-text">{descEn(arLabels[captionIdx])}</p>
                        </div>
                      )}
                    </div>
                    {(["l", "r", "t", "b"] as const).map((s) => (
                      <span
                        key={s}
                        className={`ar-cap-handle ar-cap-handle--${s}`}
                        title={s === "l" || s === "r" ? "幅を変える" : "縦に伸ばす（幅が狭まる）"}
                        onPointerDown={onCapResizeDown}
                        onPointerMove={onEditMove}
                        onPointerUp={onEditUp}
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
                        color: titleColor,
                        "--title-ff": roleFontStack(titleFont),
                        "--title-fs": titleScale,
                        "--title-sh": titleShadow ? contrastShadow(titleColor) : "transparent",
                      } as React.CSSProperties
                    }
                    onPointerDown={onTitleDown}
                    onPointerMove={onEditMove}
                    onPointerUp={onEditUp}
                  >
                    {tp.over && <span className="ar-title-over">{tp.over}</span>}
                    <span className="ar-title-main">{tp.main}</span>
                    {tp.num && <span className="ar-title-num">{tp.num}</span>}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* 操作パネル */}
          <div className={`studio-panel${panelOpen ? "" : " is-closed"}`}>
            <div className="studio-panel-head">
              <button className="studio-icon-btn" onClick={() => setExportView("template")} title="テンプレ選択へ戻る">
                <IconHome size={16} />
              </button>
              <span className="studio-panel-title">仕上げ</span>
              <button className="studio-icon-btn" onClick={() => setPanelOpen((o) => !o)} title={panelOpen ? "畳む" : "開く"}>
                <IconCaret dir={panelOpen ? "down" : "up"} size={16} />
              </button>
            </div>
            {panelOpen && (
              <div className="studio-panel-body">
                {/* 取り上げる山 */}
                {arLabels.length > 1 && (
                  <section className="studio-sec">
                    <h3>取り上げる山</h3>
                    <div className="ar-fs-row">
                      <span>解説・タイトル対象</span>
                      <div className="ar-font-sel">
                        <select value={captionIdx} onChange={(e) => setCaptionIdx(Number(e.target.value))} aria-label="取り上げる山">
                          {arLabels.map((l, i) => (
                            <option key={i} value={i}>{l.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </section>
                )}

                {/* 山名 */}
                <section className="studio-sec">
                  <h3><IconMountain size={13} /> 山名</h3>
                  <label className="switch-row">
                    <span>写真に山名を入れる</span>
                    <input type="checkbox" className="switch" checked={bakeLabels} onChange={(e) => setBakeLabels(e.target.checked)} />
                  </label>
                  {bakeLabels && (
                    <>
                      <div className="ar-fs-row">
                        <span>表示</span>
                        <div className="ar-font-sel">
                          <select value={labelMode} onChange={(e) => setLabelMode(e.target.value as LabelMode)} aria-label="ラベルの表示内容">
                            <option value="jaSubEnElev">日本語名 ＋ 英語名・標高</option>
                            <option value="jaSubEn">日本語名 ＋ 英語名</option>
                            <option value="jaSubElev">日本語名 ＋ 標高</option>
                            <option value="enSubElev">英語名 ＋ 標高</option>
                            <option value="jaOnly">日本語名のみ</option>
                            <option value="enOnly">英語名のみ</option>
                          </select>
                        </div>
                      </div>
                      <div className="ar-fs-row">
                        <span>背景パネル</span>
                        <div className="seg" role="group" aria-label="背景パネル">
                          {([["なし", "none"], ["半透明", "translucent"]] as [string, BgPanel][]).map(([lab, v]) => (
                            <button key={v} className={labelBg === v ? "is-active" : ""} onClick={() => setLabelBg(v)}>{lab}</button>
                          ))}
                        </div>
                      </div>
                      <div className="ar-fs-row">
                        <span>文字の色</span>
                        <input type="color" className="ar-color-input" value={labelColor} onChange={(e) => setLabelColor(e.target.value)} aria-label="文字の色" />
                      </div>
                      <label className="switch-row">
                        <span>文字の影</span>
                        <input type="checkbox" className="switch" checked={labelShadow} onChange={(e) => setLabelShadow(e.target.checked)} />
                      </label>
                      <div className="ar-fs-slider-row">
                        <span>山名サイズ</span>
                        <span className="ar-fs-val">{Math.round(labelNameScale * 100)}%</span>
                      </div>
                      <input type="range" className="ar-fs-slider" min={0.7} max={2.0} step={0.05} value={labelNameScale} onChange={(e) => setLabelNameScale(Number(e.target.value))} aria-label="山名サイズ" />
                      {fontRow("labelName", "山名フォント")}
                      {labelHasSub && (
                        <>
                          <div className="ar-fs-slider-row">
                            <span>補足サイズ</span>
                            <span className="ar-fs-val">{Math.round(labelSubScale * 100)}%</span>
                          </div>
                          <input type="range" className="ar-fs-slider" min={0.7} max={1.6} step={0.05} value={labelSubScale} onChange={(e) => setLabelSubScale(Number(e.target.value))} aria-label="補足サイズ" />
                          {fontRow("labelSub", "補足フォント")}
                        </>
                      )}
                    </>
                  )}
                </section>

                {/* 解説 */}
                <section className="studio-sec">
                  <h3><IconInfo size={13} /> 解説</h3>
                  <div className="ar-fs-row">
                    <span>言語</span>
                    <div className="seg" role="group" aria-label="解説の言語">
                      {([["日本語", "ja"], ["英語", "en"], ["両方", "both"], ["なし", "none"]] as [string, "ja" | "en" | "both" | "none"][]).map(([lab, v]) => (
                        <button key={v} className={captionLang === v ? "is-active" : ""} onClick={() => setCaptionLang(v)}>{lab}</button>
                      ))}
                    </div>
                  </div>
                  {captionLang !== "none" && (
                    <>
                      {captionLang === "both" && (
                        <>
                          <div className="ar-fs-row">
                            <span>並べ方</span>
                            <div className="seg" role="group" aria-label="日英の並べ方">
                              {([["横", "horizontal"], ["縦", "vertical"]] as [string, "horizontal" | "vertical"][]).map(([lab, v]) => (
                                <button key={v} className={captionLayout === v ? "is-active" : ""} onClick={() => setCaptionLayout(v)}>{lab}</button>
                              ))}
                            </div>
                          </div>
                          <div className="ar-fs-row">
                            <span>見出し</span>
                            <div className="ar-font-sel">
                              <select value={captionTitleMode} onChange={(e) => setCaptionTitleMode(e.target.value as "each" | "groupV" | "groupH" | "ja" | "en")} aria-label="見出しの出し方">
                                <option value="each">本文ごと</option>
                                <option value="groupV">まとめる（上下）</option>
                                <option value="groupH">まとめる（左右）</option>
                                <option value="ja">日本語のみ</option>
                                <option value="en">英語のみ</option>
                              </select>
                            </div>
                          </div>
                        </>
                      )}
                      <div className="ar-fs-row">
                        <span>長さ</span>
                        <div className="seg" role="group" aria-label="解説の長さ">
                          {([["長め", "long"], ["短め", "short"]] as [string, "long" | "short"][]).map(([lab, v]) => (
                            <button key={v} className={captionLength === v ? "is-active" : ""} onClick={() => setCaptionLength(v)}>{lab}</button>
                          ))}
                        </div>
                      </div>
                      <div className="ar-fs-row">
                        <span>背景パネル</span>
                        <div className="seg" role="group" aria-label="解説の背景パネル">
                          {([["なし", "none"], ["半透明", "translucent"]] as [string, BgPanel][]).map(([lab, v]) => (
                            <button key={v} className={captionBg === v ? "is-active" : ""} onClick={() => setCaptionBg(v)}>{lab}</button>
                          ))}
                        </div>
                      </div>
                      <div className="ar-fs-row">
                        <span>文字の色</span>
                        <input type="color" className="ar-color-input" value={captionColor} onChange={(e) => setCaptionColor(e.target.value)} aria-label="解説の文字の色" />
                      </div>
                      <label className="switch-row">
                        <span>文字の影</span>
                        <input type="checkbox" className="switch" checked={captionShadow} onChange={(e) => setCaptionShadow(e.target.checked)} />
                      </label>
                      <div className="ar-fs-slider-row">
                        <span>見出しサイズ</span>
                        <span className="ar-fs-val">{Math.round(captionTitleScale * 100)}%</span>
                      </div>
                      <input type="range" className="ar-fs-slider" min={0.7} max={2.0} step={0.05} value={captionTitleScale} onChange={(e) => setCaptionTitleScale(Number(e.target.value))} aria-label="見出しサイズ" />
                      <div className="ar-fs-slider-row">
                        <span>本文サイズ</span>
                        <span className="ar-fs-val">{Math.round(captionBodyScale * 100)}%</span>
                      </div>
                      <input type="range" className="ar-fs-slider" min={0.7} max={1.6} step={0.05} value={captionBodyScale} onChange={(e) => setCaptionBodyScale(Number(e.target.value))} aria-label="本文サイズ" />
                      {fontRow("captionTitle", "見出しフォント")}
                      {fontRow("captionBody", "本文フォント")}
                      {/* タグ */}
                      <label className="switch-row">
                        <span>タグに標高</span>
                        <input type="checkbox" className="switch" checked={capShowElev} onChange={(e) => setCapShowElev(e.target.checked)} />
                      </label>
                      <label className="switch-row">
                        <span>タグに場所</span>
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
                      <div className="ar-fs-row">
                        <span>タグの色</span>
                        <input type="color" className="ar-color-input" value={tagColor} onChange={(e) => setTagColor(e.target.value)} aria-label="タグの色" />
                      </div>
                      <div className="ar-fs-row">
                        <span>色の使い方</span>
                        <div className="seg" role="group" aria-label="タグの色の使い方">
                          {([["背景", "bg"], ["文字", "text"]] as [string, "bg" | "text"][]).map(([lab, v]) => (
                            <button key={v} className={tagColorTarget === v ? "is-active" : ""} onClick={() => setTagColorTarget(v)}>{lab}</button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </section>

                {/* センタータイトル */}
                <section className="studio-sec">
                  <h3>タイトル</h3>
                  <label className="switch-row">
                    <span>中央に大きな山名</span>
                    <input type="checkbox" className="switch" checked={titleOn} onChange={(e) => setTitleOn(e.target.checked)} />
                  </label>
                  {titleOn && (
                    <>
                      <div className="ar-fs-row">
                        <span>言語</span>
                        <div className="seg" role="group" aria-label="タイトルの言語">
                          {([["英語", "en"], ["日本語", "ja"]] as [string, "en" | "ja"][]).map(([lab, v]) => (
                            <button key={v} className={titleLang === v ? "is-active" : ""} onClick={() => setTitleLang(v)}>{lab}</button>
                          ))}
                        </div>
                      </div>
                      <label className="switch-row">
                        <span>小見出し（場所）</span>
                        <input type="checkbox" className="switch" checked={titleShowOver} onChange={(e) => setTitleShowOver(e.target.checked)} />
                      </label>
                      <label className="switch-row">
                        <span>標高</span>
                        <input type="checkbox" className="switch" checked={titleShowNum} onChange={(e) => setTitleShowNum(e.target.checked)} />
                      </label>
                      <div className="ar-fs-slider-row">
                        <span>サイズ</span>
                        <span className="ar-fs-val">{Math.round(titleScale * 100)}%</span>
                      </div>
                      <input type="range" className="ar-fs-slider" min={0.7} max={2.0} step={0.05} value={titleScale} onChange={(e) => setTitleScale(Number(e.target.value))} aria-label="タイトルサイズ" />
                      <div className="ar-fs-row">
                        <span>文字の色</span>
                        <input type="color" className="ar-color-input" value={titleColor} onChange={(e) => setTitleColor(e.target.value)} aria-label="タイトルの色" />
                      </div>
                      <label className="switch-row">
                        <span>文字の影</span>
                        <input type="checkbox" className="switch" checked={titleShadow} onChange={(e) => setTitleShadow(e.target.checked)} />
                      </label>
                      <div className="ar-fs-row">
                        <span>フォント</span>
                        <div className="ar-font-sel">
                          <select value={titleFont} onChange={(e) => setTitleFont(e.target.value as FontPairId)} aria-label="タイトルフォント">
                            {FONT_PAIR_IDS.map((id) => (
                              <option key={id} value={id}>{FONT_PAIRS[id].label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </>
                  )}
                </section>

                {/* 余白・切り抜き */}
                <section className="studio-sec">
                  <h3>余白・切り抜き</h3>
                  {(["t", "b", "l", "r"] as const).map((d) => (
                    <div key={`m${d}`}>
                      <div className="ar-fs-slider-row">
                        <span>余白 {d === "t" ? "上" : d === "b" ? "下" : d === "l" ? "左" : "右"}</span>
                        <span className="ar-fs-val">{Math.round(frameMargin[d] * 100)}%</span>
                      </div>
                      <input type="range" className="ar-fs-slider" min={0} max={1} step={0.01} value={frameMargin[d]} onChange={(e) => setFrameMargin((p) => ({ ...p, [d]: Number(e.target.value) }))} aria-label={`余白${d}`} />
                    </div>
                  ))}
                  <div className="ar-fs-row">
                    <span>余白の色</span>
                    <input type="color" className="ar-color-input" value={frameMarginColor} onChange={(e) => setFrameMarginColor(e.target.value)} aria-label="余白の色" disabled={frameMarginAuto} />
                  </div>
                  <label className="switch-row">
                    <span>余白の色を写真に合わせる</span>
                    <input type="checkbox" className="switch" checked={frameMarginAuto} onChange={(e) => setFrameMarginAuto(e.target.checked)} />
                  </label>
                  <div className="ar-fs-slider-row">
                    <span>ふち（ぼかし）</span>
                    <span className="ar-fs-val">{Math.round(frameFade * 100)}%</span>
                  </div>
                  <input type="range" className="ar-fs-slider" min={0} max={0.5} step={0.01} value={frameFade} onChange={(e) => setFrameFade(Number(e.target.value))} aria-label="ふち" />
                  {(["l", "t", "r", "b"] as const).map((d) => (
                    <div key={`c${d}`}>
                      <div className="ar-fs-slider-row">
                        <span>切り抜き {d === "t" ? "上" : d === "b" ? "下" : d === "l" ? "左" : "右"}</span>
                        <span className="ar-fs-val">{Math.round(cropInset[d] * 100)}%</span>
                      </div>
                      <input type="range" className="ar-fs-slider" min={0} max={0.45} step={0.01} value={cropInset[d]} onChange={(e) => setCropInset((p) => ({ ...p, [d]: Number(e.target.value) }))} aria-label={`切り抜き${d}`} />
                    </div>
                  ))}
                </section>

                {/* 書き出し */}
                <div className="studio-actions">
                  <button className="ar-btn-sub" onClick={dumpCurrentStyle}>設定を出力</button>
                  <button className="ar-btn-main" onClick={openExportPreview} disabled={previewBaking}>
                    <IconDownload size={15} />
                    {previewBaking ? "生成中…" : "書き出す"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
