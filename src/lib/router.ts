// 最小のURLルーティング補助。ライブラリは使わず History API のみ。
// Vite の base（GitHub Pages では "/frame-dev/"）を差し引いた「アプリ内パス」で扱う。

// 現在のアプリ内パス（先頭 "/"、末尾スラッシュなし）を返す。
export function appPath(): string {
  const base = import.meta.env.BASE_URL;
  let p = window.location.pathname;
  if (base !== "/" && p.startsWith(base.replace(/\/$/, ""))) {
    p = p.slice(base.replace(/\/$/, "").length);
  }
  p = p.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

// アプリ内パス → href（<a href> にそのまま使える、base込みのURL）。
export function appHref(to: string): string {
  return import.meta.env.BASE_URL.replace(/\/$/, "") + to;
}

// SPA内遷移。pushState して popstate を発火させ、購読側（Root）を再描画させる。
export function navigate(to: string): void {
  window.history.pushState(null, "", appHref(to));
  window.dispatchEvent(new PopStateEvent("popstate"));
}
