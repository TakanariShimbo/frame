// 撮影画像の EXIF から AR に必要な「位置・向き・画角」を取り出す（exifr のラッパ）。
// いずれも欠けていることが多い（SNS経由・スクショ・編集済みで剥がれる）ので、
// 取れた項目だけ返し、呼び出し側で手動フォールバックする前提。
import exifr from "exifr";

export type PhotoExif = {
  lat: number | null; // GPS緯度（観測点の自動配置に使う）
  lon: number | null; // GPS経度
  headingDeg: number | null; // 撮影方位 GPSImgDirection（heading の初期値）
  hFovDeg: number | null; // 横画角（35mm換算焦点距離から算出）
};

// 35mm換算焦点距離(mm) → 横画角(deg)。フルフレーム横幅 36mm（半幅 18mm）基準。
// 横位置(ランドスケープ)前提。縦位置写真は別途要対応（M2では未対応）。
function focal35ToHFov(f35: number): number | null {
  if (!(f35 > 0)) return null;
  return (2 * Math.atan(18 / f35) * 180) / Math.PI;
}

export async function readPhotoExif(file: File): Promise<PhotoExif> {
  let data: Record<string, unknown> | undefined;
  try {
    // 既定で TIFF/EXIF/GPS ブロックを解析。GPS があれば latitude/longitude を補完してくれる。
    data = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
    });
  } catch {
    data = undefined;
  }
  if (!data) return { lat: null, lon: null, headingDeg: null, hFovDeg: null };

  const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);
  const f35 = num(data.FocalLengthIn35mmFilm) ?? num(data.FocalLengthIn35mmFormat);
  return {
    lat: num(data.latitude),
    lon: num(data.longitude),
    headingDeg: num(data.GPSImgDirection),
    hFovDeg: f35 != null ? focal35ToHFov(f35) : null,
  };
}

// ============================================================================
// 撮影情報（liit 風フレーム用）: カメラ名・メーカー・撮影設定を表示用文字列で返す。
// EXIF が剥がれていることも多いので、取れた項目だけ埋めて返す（全滅なら null）。
// ============================================================================
export type ShootingInfo = {
  model: string;
  maker: string;
  spec: string;
  lens: string; // レンズ名（例: RF15-35mm F2.8 L IS USM。ギャラリーフレーム用）
  date: string; // 撮影日（例: 2026.08.10。ギャラリーフレーム用）
};

export async function readShootingInfo(url: string): Promise<ShootingInfo | null> {
  let data: Record<string, unknown> | undefined;
  try {
    const blob = await (await fetch(url)).blob();
    data = await exifr.parse(blob, { tiff: true, exif: true });
  } catch {
    data = undefined;
  }
  if (!data) return null;
  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);
  const model = str(data.Model);
  const maker = str(data.Make).split(/\s+/)[0] ?? ""; // "SONY CORPORATION" → "SONY"
  const lens = str(data.LensModel);
  const dt = data.DateTimeOriginal instanceof Date ? data.DateTimeOriginal : data.CreateDate instanceof Date ? data.CreateDate : null;
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const date = dt ? `${dt.getFullYear()}.${pad2(dt.getMonth() + 1)}.${pad2(dt.getDate())}` : "";
  const parts: string[] = [];
  const fl = num(data.FocalLength);
  if (fl != null) parts.push(`${Math.round(fl)}mm`);
  const fn = num(data.FNumber);
  if (fn != null) parts.push(`f/${fn.toFixed(1)}`);
  const et = num(data.ExposureTime);
  if (et != null && et > 0) parts.push(et >= 1 ? `${et.toFixed(1)}s` : `1/${Math.round(1 / et)}s`);
  const iso = num(data.ISO);
  if (iso != null) parts.push(`ISO${Math.round(iso)}`);
  const spec = parts.join("  ");
  if (!model && !maker && !spec && !lens && !date) return null;
  return { model, maker, spec, lens, date };
}

// ============================================================================
// GPS座標（イベントフレームのフィールドノート表示用）: 度分秒の表示文字列で返す。
// 例: 36°20'31"N\n137°38'51"E（2行。写真上では行ごとに描画される）。
// ============================================================================
// 緯度経度 → 度分秒の表示テキスト（2行）。写真のEXIF由来・山岳辞書の山頂座標のどちらにも使う。
export function gpsToText(lat: number, lon: number): string {
  const dms = (deg: number, pos: string, neg: string): string => {
    const hemi = deg < 0 ? neg : pos;
    const a = Math.abs(deg);
    const d = Math.floor(a);
    const m = Math.floor((a - d) * 60);
    const s = Math.round(((a - d) * 60 - m) * 60);
    return `${d}°${m}'${s}"${hemi}`;
  };
  return `${dms(lat, "N", "S")}\n${dms(lon, "E", "W")}`;
}

export async function readGpsText(url: string): Promise<string | null> {
  let data: Record<string, unknown> | undefined;
  try {
    const blob = await (await fetch(url)).blob();
    data = await exifr.parse(blob, { tiff: true, gps: true });
  } catch {
    data = undefined;
  }
  const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);
  const lat = num(data?.latitude);
  const lon = num(data?.longitude);
  if (lat == null || lon == null) return null;
  return gpsToText(lat, lon);
}
