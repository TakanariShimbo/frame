// 動画入力のためのユーティリティ。
// 編集（山選び・ラベル配置・プレビュー）は動画の先頭フレームを起こした静止画（ポスター）で行い、
// 書き出し時だけ全フレームへ同じオーバーレイを重ねて動画として保存する。

export type PickedMedia = {
  photoUrl: string; // 編集に使う静止画URL（画像ならその画像、動画ならポスター）
  videoUrl: string | null; // 動画ならその動画URL、画像なら null
};

export const isVideoFile = (f: File) => f.type.startsWith("video/");

// 動画の先頭フレームを JPEG に起こして、編集用のポスター画像URLを返す。
// ブラウザによっては loadeddata 直後だと描画可能なフレームが無いことがあるため、
// 先頭近くへ明示的にシークしてから描く。
export async function extractVideoPoster(videoUrl: string): Promise<string> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  await new Promise<void>((resolve, reject) => {
    video.onerror = () => reject(new Error("動画を読み込めませんでした"));
    video.onseeked = () => resolve();
    video.onloadedmetadata = () => {
      video.currentTime = 0.001;
    };
    video.src = videoUrl;
  });
  const W = video.videoWidth, H = video.videoHeight;
  if (!W || !H) throw new Error("動画のサイズを取得できませんでした");
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas を初期化できませんでした");
  ctx.drawImage(video, 0, 0, W, H);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
  if (!blob) throw new Error("ポスター画像を生成できませんでした");
  return URL.createObjectURL(blob);
}

// 選択されたファイル列を PickedMedia 列へ。読めない動画はスキップする（呼び出し側で件数差を通知）。
export async function filesToMedia(files: File[]): Promise<PickedMedia[]> {
  const out: PickedMedia[] = [];
  for (const f of files) {
    if (isVideoFile(f)) {
      const videoUrl = URL.createObjectURL(f);
      try {
        out.push({ photoUrl: await extractVideoPoster(videoUrl), videoUrl });
      } catch {
        URL.revokeObjectURL(videoUrl);
      }
    } else {
      out.push({ photoUrl: URL.createObjectURL(f), videoUrl: null });
    }
  }
  return out;
}

// MediaRecorder が使える形式を優先順で選ぶ（Safari は mp4、Chrome/Firefox は webm が主）。
const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];
export function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export const videoExtension = (mime: string): "mp4" | "webm" => (mime.includes("mp4") ? "mp4" : "webm");

// ブラウザが動画書き出し（canvas.captureStream + MediaRecorder）に対応しているか。
export const canBakeVideo = () =>
  typeof MediaRecorder !== "undefined" &&
  typeof HTMLCanvasElement !== "undefined" &&
  "captureStream" in HTMLCanvasElement.prototype;
