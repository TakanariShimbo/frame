// ============================================================================
// 書き出し（画像の生成・保存）のブラウザ差異を吸収する共通ヘルパー。
// スマホ（iOS WebKit / Android Chrome）で報告される失敗系をここで一括で防ぐ:
//  - img.decode() が大きい写真で失敗する（古いWebKitのバグ）→ onload へフォールバック
//  - canvas.toBlob が null / toDataURL が "data:," を返す（メモリ・面積上限超過）→ 検知して失敗を返す
//  - <a download> が効かない端末 → Web Share API を先に試す
//  - anchor 未追加・objectURL の早期 revoke で保存が無反応になる → DOM追加＋余裕を持って revoke
// ============================================================================

// 画像を確実にロードして返す。decode() が使えれば使い、失敗しても onload まで
// 到達していれば描画自体は可能なので resolve する。
export const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    let settled = false;
    const ok = () => {
      if (settled) return;
      settled = true;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) resolve(img);
      else reject(new Error("image has no size"));
    };
    const ng = () => {
      if (settled) return;
      settled = true;
      reject(new Error("image load failed"));
    };
    img.onload = ok;
    img.onerror = ng;
    img.src = url;
    if (typeof img.decode === "function") img.decode().then(ok, () => {/* onload/onerror に任せる */});
    else if (img.complete) ok();
  });

export const dataUrlToBlob = (dataUrl: string): Blob | null => {
  const m = dataUrl.match(/^data:([^;,]+);base64,(.*)$/);
  if (!m) return null;
  try {
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch {
    return null;
  }
};

// canvas → JPEG Blob。toBlob が null を返す端末では toDataURL 経由を試し、
// それも空（"data:," 等）なら null（＝この解像度では書き出せない）を返す。
export const canvasToJpegBlob = async (canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob | null> => {
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, "image/jpeg", quality);
    } catch {
      resolve(null);
    }
  });
  if (blob && blob.size > 0) return blob;
  try {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (!dataUrl.startsWith("data:image/")) return null; // 上限超過時は "data:," が返る
    const b = dataUrlToBlob(dataUrl);
    return b && b.size > 0 ? b : null;
  } catch {
    return null;
  }
};

// スマホ・タブレット判定（iPadOS は Macintosh を名乗るため maxTouchPoints で拾う）。
export const isMobileLike = (): boolean =>
  /iPhone|iPad|iPod|Android/.test(navigator.userAgent) ||
  (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);

export type SaveOutcome = "shared" | "downloaded" | "cancelled" | "failed";

// <a download> によるダウンロード。iOS の古い WebKit は DOM 未追加の anchor だと
// 無反応になるため必ず追加し、objectURL は余裕を持って revoke する。
export const downloadBlob = (blob: Blob, filename: string): SaveOutcome => {
  try {
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return "downloaded";
  } catch {
    return "failed";
  }
};

// 保存。モバイルではまず Web Share API（「"写真"に保存」等が出せて確実）を試し、
// 使えない・失敗した場合はダウンロードへフォールバックする。PC は直接ダウンロード
// （共有シートはファイル保存に繋がらないため使わない）。
export const saveBlob = async (blob: Blob, filename: string): Promise<SaveOutcome> => {
  if (isMobileLike() && typeof navigator.canShare === "function") {
    try {
      const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return "shared";
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancelled"; // ユーザーがキャンセル
      // それ以外（共有の失敗）はダウンロードへフォールバック
    }
  }
  return downloadBlob(blob, filename);
};
