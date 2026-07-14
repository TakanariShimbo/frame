import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconDownload, IconCaret, IconChevron } from "./icons";
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
  labelPanelColor: string;
  labelPanelOpacity: number;
  labelColor: string;
  labelShadow: boolean;
  labelLineOn: boolean;
  labelLineColor: string;
  labelNameScale: number;
  labelSubScale: number;
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
  labelPanelColor: "#1f2633",
  labelPanelOpacity: DEFAULT_PANEL_OPACITY,
  labelColor: "#ffffff",
  labelShadow: true,
  labelLineOn: true,
  labelLineColor: "#ffffff",
  labelNameScale: 1,
  labelSubScale: 1,
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
// テンプレートは「図(zu)」=3Dミニマップ入りを除いた5種（栞・双は「語」に統合）。
const EXPORT_TEMPLATES: ExportTemplate[] = [
  {
    id: "miyabi",
    name: "雅",
    sub: "山名を美しく",
    hint: "明朝体の山名に英語名と標高を添える、まず選びたい王道の仕上がり。どんな写真にもなじむ。",
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
    sub: "一座を主役に",
    hint: "写真の真ん中に山名を大きく据えるポスター風。主役の一座を印象的に見せたいときに。",
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
    sub: "山の物語を添えて",
    hint: "山の解説を日英併記で添える読み物風。言語は日本語のみ・英語のみにも切り替えられる。",
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
    sub: "余白と縦書きで",
    hint: "大きな余白に縦書きの解説を組み、写真を掛け軸のように細く見せる。静けさを楽しむ作品風。",
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
    sub: "空へひらく",
    hint: "上に空色の余白を広げ、写真の稜線へやわらかく溶かし込む縦構図。空の広さが主役になる。",
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
const TPL_PREVIEW_VER = "?v=2";
const TPL_ITEMS: TplItem[] = [
  ...EXPORT_TEMPLATES.map((t) => ({ id: t.id, name: t.name, sub: t.sub, hint: t.hint, tpl: t as ExportTemplate | null })),
  { id: "custom", name: "素", sub: "自分で設定", hint: "テーマを使わず、最初から自分で仕上げる。", tpl: null },
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
type PanelTab = "label" | "caption" | "title" | "frame";
const PANEL_TABS: PanelTab[] = ["label", "caption", "title", "frame"];
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
};

type StudioProps = {
  photoUrl: string;
  initialLabels: ArLabel[];
  // 一覧から再編集で入るときの復元データ。あれば initialLabels より優先。
  initialSnapshot?: StudioSnapshot | null;
  // 一覧へ戻る。編集状態（テンプレ選択前なら null）と最新の書き出しを渡す。
  onExit: (snapshot: StudioSnapshot | null, exportBlob: Blob | null) => void;
  // この写真の山選びへ戻る（編集は破棄）。
  onReselect: () => void;
  // 次の未仕上げ写真へ。残りがあるときだけ渡される。
  nextCount?: number;
  onNext?: (snapshot: StudioSnapshot | null, exportBlob: Blob | null) => void;
};

export default function Studio({ photoUrl, initialLabels, initialSnapshot = null, onExit, onReselect, nextCount = 0, onNext }: StudioProps) {
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
  const [titleColor, setTitleColor] = useState(initStyle?.titleColor ?? "#ffffff");
  const [titleShadow, setTitleShadow] = useState(initStyle?.titleShadow ?? true);
  const [titleFont, setTitleFont] = useState<FontPairId>(initStyle?.titleFont ?? "posterMincho");
  const [titlePos, setTitlePos] = useState(initStyle?.titlePos ?? ({ u: 0.5, v: 0.44 }));
  const titleDragRef = useRef<{ offU: number; offV: number; w: number; h: number } | null>(null);

  // --- フォント（役割ごと） --- //
  const [roleFonts, setRoleFonts] = useState<RoleFonts>(initStyle?.roleFonts ?? DEFAULT_ROLE_FONTS);
  const setRoleFont = (role: FontRole, value: FontPairId) => setRoleFonts((p) => ({ ...p, [role]: value }));

  // --- フレーム（切り抜き・余白・ふち） --- //
  const [cropInset, setCropInset] = useState(initStyle?.cropInset ?? ({ l: 0, t: 0, r: 0, b: 0 }));
  const [frameMargin, setFrameMargin] = useState(initStyle?.frameMargin ?? ({ t: 0, r: 0, b: 0, l: 0 }));
  const [frameMarginColor, setFrameMarginColor] = useState(initStyle?.frameMarginColor ?? "#ffffff");
  const [frameMarginAuto, setFrameMarginAuto] = useState(initStyle?.frameMarginAuto ?? false);
  const [frameFade, setFrameFade] = useState(initStyle?.frameFade ?? 0);

  // --- 書き出し --- //
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewBaking, setPreviewBaking] = useState(false);
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
  const captionDragRef = useRef<{ offU: number; offV: number; h: number } | null>(null);
  // ドラッグ中にスナップした基準線（フレーム正規化座標）。ガイド線の描画用。
  const [snapGuide, setSnapGuide] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
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
    setLabelPanelColor(s.labelPanelColor);
    setLabelPanelOpacity(s.labelPanelOpacity);
    setLabelColor(s.labelColor);
    setLabelShadow(s.labelShadow);
    setLabelLineOn(s.labelLineOn);
    setLabelLineColor(s.labelLineColor);
    setLabelNameScale(s.labelNameScale);
    setLabelSubScale(s.labelSubScale);
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
    labelNameScale, labelSubScale,
    captionLang, captionLayout, captionTitleMode, captionLength, captionBg, captionPanelColor, captionPanelOpacity, captionColor, captionShadow,
    captionTitleScale, captionBodyScale, captionPos, captionW, captionSplit,
    tagColor, tagColorTarget, capShowElev, capShowLoc, capSelectedTags,
    titleOn, titleLang, titleShowOver, titleShowNum, titleScale, titleColor, titleShadow, titleFont, titlePos,
    roleFonts, frameMargin, frameMarginColor, frameMarginAuto, cropInset, frameFade,
  });

  // 一覧へ渡す編集状態。一度も編集に入っていなければ null。
  // テーマ選択へ「戻った」だけの状態でも、編集済みの内容は保存する。
  const makeSnapshot = (): StudioSnapshot | null =>
    everEdited
      ? { style: currentStyle(), templateId: activeTemplateId, labels: arLabels, captionIdx }
      : null;

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

  // 一覧へ戻る。編集に入っている写真は、その時点の見た目を自動で書き出してから戻る
  // （一覧で「仕上げ済み」になり、まとめて保存にも含まれる。手動の「書き出す」は不要）。
  const [exiting, setExiting] = useState(false);
  const exitToBoard = async () => {
    if (exiting) return;
    let blob = previewBlob;
    if (exportView === "edit") {
      setExiting(true);
      const r = await bakeComposite();
      setExiting(false);
      if (r) blob = r.blob;
    }
    onExit(makeSnapshot(), blob);
  };
  // 保存。iOS(WebKit)は <a download> が効かないことが多いので、モバイル端末では
  // まず Web Share API（「"写真"に保存」/共有が出せる）を試す。PCでは共有シートを
  // 出してもファイル保存に繋がらない（キャンセルすると保存自体が中断される）ため、
  // 共有は使わず直接ダウンロードする。
  const saveExportImage = async () => {
    const isMobileLike =
      /iPhone|iPad|iPod|Android/.test(navigator.userAgent) ||
      (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1); // iPadOSはMac名乗り
    const file = previewBlob ? new File([previewBlob], "frame.jpg", { type: "image/jpeg" }) : null;
    if (isMobileLike && file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
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
  };
  const relevantTabs = activeTemplate ? templateTabs(activeTemplate.style) : PANEL_TABS;
  const visibleTabs = panelMode === "simple" ? PANEL_TABS.filter((t) => relevantTabs.includes(t) || tabOn[t]) : PANEL_TABS;
  const changePanelMode = (m: "simple" | "full") => {
    setPanelMode(m);
    try {
      localStorage.setItem(PANEL_MODE_KEY, m);
    } catch {
      /* 保存できなくても動作に支障なし */
    }
    if (m === "simple") {
      const simple = PANEL_TABS.filter((t) => relevantTabs.includes(t) || tabOn[t]);
      if (!simple.includes(panelTab)) setPanelTab(simple[0] ?? "label");
    }
  };
  // 「取り上げる山」セレクト（解説・タイトルの両タブ先頭に出す）。
  const subjectRow =
    arLabels.length > 1 ? (
      <div className="ar-fs-row">
        <span>取り上げる山</span>
        <div className="ar-font-sel">
          <select value={captionIdx} onChange={(e) => setCaptionIdx(Number(e.target.value))} aria-label="取り上げる山">
            {arLabels.map((l, i) => (
              <option key={i} value={i}>{l.name}</option>
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
              <h1>テーマを選ぶ</h1>
              <p>{isNarrow ? "スワイプで見比べて、気に入ったテーマで仕上げへ。" : "左右で見比べて、気に入ったテーマで仕上げへ。"}あとから細かく調整できます。</p>
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
                      aria-label={i === tplIdx ? `${it.sub}で仕上げる` : `${it.sub}を見る`}
                    >
                      {it.tpl ? (
                        <img src={`${import.meta.env.BASE_URL}template-previews/${it.id}.jpg${TPL_PREVIEW_VER}`} alt={it.sub} />
                      ) : (
                        <div className="tpl-card-custom">テーマなしで、まっさらから</div>
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
                      <b>{TPL_ITEMS[tplIdx].sub}</b>
                      <p>{TPL_ITEMS[tplIdx].hint}</p>
                    </div>
                  </div>
                  <button type="button" className="ar-btn-main tpl-choose" onClick={() => chooseTpl(TPL_ITEMS[tplIdx])}>
                    このテーマで仕上げる
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
                    aria-label="前のテーマ"
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
                            transform: `translateY(-50%) translateX(calc(-50% + ${off} * clamp(170px, 19vw, 275px))) translateZ(${off === 0 ? 0 : -220 - abs * 70}px) rotateY(${off === 0 ? 0 : off < 0 ? 48 : -48}deg)`,
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
                          aria-label={off === 0 ? `${it.sub}で仕上げる` : `${it.sub}を見る`}
                        >
                          {it.tpl ? (
                            <img src={`${import.meta.env.BASE_URL}template-previews/${it.id}.jpg${TPL_PREVIEW_VER}`} alt="" />
                          ) : (
                            <div className="tpl-card-custom">テーマなしで、まっさらから</div>
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
                    aria-label="次のテーマ"
                  >
                    ›
                  </button>
                </div>
                <div className="tpl-flow-info">
                  <div className="tpl-slide-body">
                    <span className="tpl-kanji" aria-hidden="true">{TPL_ITEMS[tplIdx].name}</span>
                    <div className="tpl-slide-text">
                      <b>{TPL_ITEMS[tplIdx].sub}</b>
                      <p>{TPL_ITEMS[tplIdx].hint}</p>
                    </div>
                  </div>
                  <button type="button" className="ar-btn-main tpl-choose" onClick={() => chooseTpl(TPL_ITEMS[tplIdx])}>
                    このテーマで仕上げる
                  </button>
                </div>
              </>
            )}

            <div className="ar-tpl-foot">
              <button className="ar-btn-sub" onClick={() => onExit(makeSnapshot(), previewBlob)}>一覧へ</button>
              <button className="ar-btn-sub" onClick={onReselect}>山を選び直す</button>
            </div>
          </div>
        </div>
      )}

      {/* 書き出しプレビュー */}
      {previewUrl !== null && (
        <div className="ar-preview" onClick={() => setPreviewUrl(null)}>
          <div className="ar-preview-card" onClick={(e) => e.stopPropagation()}>
            <div className="ar-preview-head">
              <span>できあがり</span>
              <span className="ar-preview-note">この内容で保存します。よければダウンロードしてください。</span>
            </div>
            <div className="ar-preview-body">
              <img src={previewUrl} alt="書き出しプレビュー" />
            </div>
            <p className="studio-save-hint">保存できないときは、上の画像を長押しして「&quot;写真&quot;に保存」も使えます。</p>
            <div className="ar-preview-actions">
              <button className="ar-btn-sub" onClick={() => setPreviewUrl(null)}>もどる</button>
              {onNext ? (
                <button
                  className="ar-btn-sub"
                  onClick={() => onNext(makeSnapshot(), previewBlob)}
                  title="この写真を終えて、次のまだ仕上げていない写真へ"
                >
                  次の写真へ（あと{nextCount}枚）
                </button>
              ) : (
                <button
                  className="ar-btn-sub"
                  onClick={() => onExit(makeSnapshot(), previewBlob)}
                  title="仕上げを終えて一覧へ"
                >
                  一覧へ
                </button>
              )}
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
          <div
            className="ar-edit-stage studio-stage"
            ref={arEditStageRef}
            style={
              {
                "--label-name-fs": labelNameScale, // ラベル1段目（山名）のサイズ倍率
                "--label-sub-fs": labelSubScale, // ラベル2段目（補足）のサイズ倍率
                "--cap-title-fs": captionTitleScale, // 解説見出しのサイズ倍率
                "--cap-body-fs": captionBodyScale, // 解説本文のサイズ倍率
                "--label-name-ff": roleFontStack(roleFonts.labelName), // 山名フォント
                "--label-sub-ff": roleFontStack(roleFonts.labelSub), // 補足フォント
                "--cap-title-ff": roleFontStack(roleFonts.captionTitle), // 見出しフォント
                "--cap-body-ff": roleFontStack(roleFonts.captionBody), // 本文フォント
              } as React.CSSProperties
            }
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
                            ...(labelBg !== "none" ? { "--label-panel-bg": panelRgba(labelPanelColor, labelPanelOpacity) } : {}),
                          } as React.CSSProperties
                        }
                        onPointerDown={onEditDown(i, "label")}
                        onPointerMove={onEditMove}
                        onPointerUp={onEditUp}
                        onPointerCancel={onEditUp}
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
                      {(captionLang === "ja" || captionLang === "both") && descJa(arLabels[captionIdx]) && (
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
                          onPointerCancel={onEditUp}
                        />
                      )}
                      {(captionLang === "en" || captionLang === "both") && descEn(arLabels[captionIdx]) && (
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
                        color: titleColor,
                        "--title-ff": roleFontStack(titleFont),
                        "--title-fs": titleScale,
                        "--title-sh": titleShadow ? contrastShadow(titleColor) : "transparent",
                      } as React.CSSProperties
                    }
                    onPointerDown={onTitleDown}
                    onPointerMove={onEditMove}
                    onPointerUp={onEditUp}
                    onPointerCancel={onEditUp}
                  >
                    {tp.over && <span className="ar-title-over">{tp.over}</span>}
                    <span className="ar-title-main">{tp.main}</span>
                    {tp.num && <span className="ar-title-num">{tp.num}</span>}
                  </div>
                );
              })()}
            </div>
            <p className="studio-stage-hint">文字は写真の上でドラッグして動かせます</p>
          </div>

          {/* 操作パネル。PCで畳んだときは右端の細いレールだけ残してステージを全幅に */}
          {!panelOpen && !isNarrow ? (
            <div className="studio-rail">
              <button className="studio-icon-btn" onClick={() => setPanelOpen(true)} title="設定を開く">
                <IconCaret dir="left" size={16} />
              </button>
              <span className="studio-rail-label" aria-hidden="true">仕上げ</span>
              <button className="studio-icon-btn" onClick={openExportPreview} disabled={previewBaking} title="書き出す">
                <IconDownload size={15} />
              </button>
            </div>
          ) : (
          <div className={`studio-panel${panelOpen ? "" : " is-closed"}`}>
            <div className="studio-panel-head">
              <span className="studio-panel-title">
                仕上げ
                {activeTemplate && (
                  <span className="studio-panel-tpl" title={activeTemplate.sub}>{activeTemplate.name}</span>
                )}
              </span>
              <div className="studio-mode" role="group" aria-label="パネル表示モード">
                {(
                  [
                    ["simple", "シンプル", "テンプレに関係する設定だけ表示"],
                    ["full", "フル", "すべての設定を表示"],
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
              {/* 畳む向き: PC=右（サイドパネルを右端へ）/ スマホ=下（ボトムシートを下へ） */}
              <button className="studio-icon-btn" onClick={() => setPanelOpen((o) => !o)} title={panelOpen ? "畳む" : "開く"}>
                <IconCaret dir={isNarrow ? (panelOpen ? "down" : "up") : "right"} size={16} />
              </button>
            </div>
            {panelOpen && (
              <>
              <div className="studio-tabs" role="tablist" aria-label="仕上げの設定">
                {(
                  [
                    ["label", "山名"],
                    ["caption", "解説"],
                    ["title", "タイトル"],
                    ["frame", "フレーム"],
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
                        <span>文字の背景</span>
                        <div className="seg" role="group" aria-label="文字の背景">
                          {([["なし", "none"], ["あり", "solid"]] as [string, BgPanel][]).map(([lab, v]) => (
                            <button key={v} className={labelBg === v ? "is-active" : ""} onClick={() => setLabelBg(v)}>{lab}</button>
                          ))}
                        </div>
                      </div>
                      {labelBg !== "none" && (
                        <>
                          <div className="ar-fs-row">
                            <span>背景の色</span>
                            <input type="color" className="ar-color-input" value={labelPanelColor} onChange={(e) => setLabelPanelColor(e.target.value)} aria-label="文字背景の色" />
                          </div>
                          <div className="ar-fs-slider-row">
                            <span>背景の濃さ</span>
                            <span className="ar-fs-val">{Math.round(labelPanelOpacity * 100)}%</span>
                          </div>
                          <input type="range" className="ar-fs-slider" min={0.1} max={1} step={0.05} value={labelPanelOpacity} onChange={(e) => setLabelPanelOpacity(Number(e.target.value))} aria-label="文字背景の濃さ" />
                        </>
                      )}
                      <div className="ar-fs-row">
                        <span>文字の色</span>
                        <input type="color" className="ar-color-input" value={labelColor} onChange={(e) => setLabelColor(e.target.value)} aria-label="文字の色" />
                      </div>
                      <label className="switch-row">
                        <span>引き出し線（矢印）</span>
                        <input type="checkbox" className="switch" checked={labelLineOn} onChange={(e) => setLabelLineOn(e.target.checked)} />
                      </label>
                      {labelLineOn && (
                        <div className="ar-fs-row">
                          <span>線の色</span>
                          <input type="color" className="ar-color-input" value={labelLineColor} onChange={(e) => setLabelLineColor(e.target.value)} aria-label="引き出し線の色" />
                        </div>
                      )}
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
                )}

                {/* 解説 */}
                {panelTab === "caption" && (
                <section className="studio-sec">
                  {subjectRow}
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
                      {/* 本文の編集。辞書に解説がない山でもここで書ける */}
                      {(captionLang === "ja" || captionLang === "both") && (
                        <textarea
                          className="ar-cap-editor"
                          rows={4}
                          value={capItem ? descJa(capItem) ?? "" : ""}
                          placeholder="この山の解説は辞書にありません。ここに書くと写真に載せられます。"
                          onChange={(e) => setCapText("ja", e.target.value)}
                          aria-label={`解説本文（日本語・${captionLength === "short" ? "短め" : "長め"}）`}
                        />
                      )}
                      {(captionLang === "en" || captionLang === "both") && (
                        <textarea
                          className="ar-cap-editor"
                          rows={4}
                          value={capItem ? descEn(capItem) ?? "" : ""}
                          placeholder="No description in the dictionary. Write your own here."
                          onChange={(e) => setCapText("en", e.target.value)}
                          aria-label={`解説本文（英語・${captionLength === "short" ? "短め" : "長め"}）`}
                        />
                      )}
                      {capEdited && (
                        <div className="ar-fs-row">
                          <span>編集済み</span>
                          <button type="button" className="ar-cap-restore" onClick={restoreCapText}>辞書の解説に戻す</button>
                        </div>
                      )}
                      <div className="ar-fs-row">
                        <span>文字の背景</span>
                        <div className="seg" role="group" aria-label="解説の文字の背景">
                          {([["なし", "none"], ["あり", "solid"]] as [string, BgPanel][]).map(([lab, v]) => (
                            <button key={v} className={captionBg === v ? "is-active" : ""} onClick={() => setCaptionBg(v)}>{lab}</button>
                          ))}
                        </div>
                      </div>
                      {captionBg !== "none" && (
                        <>
                          <div className="ar-fs-row">
                            <span>背景の色</span>
                            <input type="color" className="ar-color-input" value={captionPanelColor} onChange={(e) => setCaptionPanelColor(e.target.value)} aria-label="解説の文字背景の色" />
                          </div>
                          <div className="ar-fs-slider-row">
                            <span>背景の濃さ</span>
                            <span className="ar-fs-val">{Math.round(captionPanelOpacity * 100)}%</span>
                          </div>
                          <input type="range" className="ar-fs-slider" min={0.1} max={1} step={0.05} value={captionPanelOpacity} onChange={(e) => setCaptionPanelOpacity(Number(e.target.value))} aria-label="解説の文字背景の濃さ" />
                        </>
                      )}
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
                )}

                {/* センタータイトル */}
                {panelTab === "title" && (
                <section className="studio-sec">
                  {subjectRow}
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
                )}

                {/* 余白・切り抜き */}
                {panelTab === "frame" && (
                <>
                <section className="studio-sec">
                  <h3>余白・ふち</h3>
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
                </section>
                <section className="studio-sec">
                  <h3>切り抜き</h3>
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
                </>
                )}
              </div>
              </>
            )}

            {/* 書き出し（常時表示の下部バー） */}
            <div className="studio-panel-foot">
              <button className="ar-btn-sub" onClick={() => setExportView("template")} title="テーマ選択へ戻る（編集内容は保持されます）">
                <IconChevron dir="left" size={14} />
                テーマ
              </button>
              <button
                className="ar-btn-sub"
                onClick={exitToBoard}
                disabled={exiting}
                title="この時点の見た目を保存して写真一覧へ戻る"
              >
                {exiting ? "保存中…" : "一覧へ"}
              </button>
              <button className="ar-btn-main" onClick={openExportPreview} disabled={previewBaking}>
                <IconDownload size={15} />
                {previewBaking ? "生成中…" : "書き出す"}
              </button>
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
