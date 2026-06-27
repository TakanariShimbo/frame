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
