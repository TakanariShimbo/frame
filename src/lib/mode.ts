// アプリのモード（題材）。ホームで選び、以降の画面の文言を切り替える。
// 画面構成・機能は共通で、変わるのは文言だけ（useModeT が hanabi.* キーを優先して引く）。
export type AppMode = "mountain" | "hanabi";

let mode: AppMode = "mountain";

export function setAppMode(m: AppMode): void {
  mode = m;
}

export function getAppMode(): AppMode {
  return mode;
}

// 標高などの数値表示。DBには数値だけを持ち、単位はUI側でモードに応じて付ける。
// 山: "2,026m"（カンマ区切り＋m） / 花火: "2026y"（年号なのでカンマなし＋y）。
export function formatElev(v: number, en = false): string {
  const n = Math.round(v);
  return getAppMode() === "hanabi" ? `${n}${en ? "Y" : "y"}` : `${n.toLocaleString()}${en ? "M" : "m"}`;
}

// 題字用（数値と単位の間にスペースを入れる従来の見た目を踏襲）。
export function formatElevTitle(v: number, en = false): string {
  const n = Math.round(v);
  return getAppMode() === "hanabi" ? `${n} ${en ? "Y" : "y"}` : `${n.toLocaleString()} ${en ? "M" : "m"}`;
}
