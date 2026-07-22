// 動画の高速書き出し（WebCodecs）。動画をフレーム順にデコードし、オーバーレイ（文字・
// 余白・ふち）を合成して再エンコードする。再生を伴わないため実時間よりずっと速く、
// ビットレートは元動画から算出して再エンコードの劣化を抑える。音声は再エンコードせず
// そのままコピーする（無劣化）。コンテナの解析は mp4box、再構築は mp4-muxer を使い、
// どちらも動画書き出し時にだけ動的 import する（通常表示のバンドルを重くしない）。
// mp4/mov 以外の形式・WebCodecs 非対応・未知コーデックでは null を返し、呼び出し側で
// 従来のリアルタイム録画（MediaRecorder）へフォールバックする。

import type { ISOFile, Movie, Sample } from "mp4box";

// Studio の bakeCanvas と共有する幾何情報。cl..ch は「表示上の元動画」からの切り抜き
// （src矩形）、mL..chR は出力キャンバス上の動画位置（dst矩形）。いずれも論理座標で、
// 物理キャンバスへは outScale で縮小して描く。
export type BakeGeom = {
  cl: number; ct: number; cw: number; ch: number;
  mL: number; mT: number; cwR: number; chR: number;
  OW: number; OH: number; outScale: number;
};

export const canFastBake = () =>
  typeof VideoDecoder !== "undefined" && typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";

// tkhd の行列 → 表示回転（0/90/180/270）。スマホの縦撮り動画は 90/270 が入っている。
const rotationOf = (m: ArrayLike<number>): 0 | 90 | 180 | 270 => {
  const a = m[0] / 65536, b = m[1] / 65536, c = m[3] / 65536, d = m[4] / 65536;
  if (Math.abs(a) < 0.5 && Math.abs(d) < 0.5) return b > 0 && c < 0 ? 90 : 270;
  if (a < -0.5 && d < -0.5) return 180;
  return 0;
};

// MediaRecorder 由来の mp4 などは vpcC の level が 0（不明）のことがあり、そのままでは
// VideoDecoder が「あいまいなコーデック名」として拒否する。有効なレベル値へ置き換える。
const decoderCodec = (codec: string): string => {
  const m = codec.match(/^vp09\.(\d{2})\.00\.(.+)$/);
  return m ? `vp09.${m[1]}.51.${m[2]}` : codec;
};

// H.264/HEVC の VideoDecoder は avcC/hvcC の中身を description として要求する
// （VP8/VP9/AV1 は不要）。box をシリアライズして 8バイトの box ヘッダを除いて返す。
const videoDescription = (MP4: typeof import("mp4box"), mp4: ISOFile, trackId: number): Uint8Array | undefined => {
  const trak = mp4.getTrackById(trackId);
  const entries = trak?.mdia?.minf?.stbl?.stsd?.entries ?? [];
  for (const entry of entries) {
    const e = entry as { avcC?: { write: (s: InstanceType<typeof MP4.DataStream>) => void }; hvcC?: { write: (s: InstanceType<typeof MP4.DataStream>) => void } };
    const box = e.avcC ?? e.hvcC;
    if (box) {
      const stream = new MP4.DataStream(undefined, 0, MP4.Endianness.BIG_ENDIAN);
      box.write(stream);
      return new Uint8Array(stream.buffer, 8);
    }
  }
  return undefined;
};

// AAC の AudioSpecificConfig（esds 内の DecoderSpecificInfo, tag=0x05）。
const aacDescription = (mp4: ISOFile, trackId: number): Uint8Array | undefined => {
  const trak = mp4.getTrackById(trackId);
  const entries = trak?.mdia?.minf?.stbl?.stsd?.entries ?? [];
  for (const entry of entries) {
    const esds = (entry as { esds?: { esd?: { findDescriptor?: (tag: number) => { data?: Uint8Array } | undefined } } }).esds;
    const dsi = esds?.esd?.findDescriptor?.(0x05)?.data;
    if (dsi) return dsi;
  }
  return undefined;
};

// エンコーダのコーデックを対応状況から選ぶ（互換性優先で H.264 → HEVC → VP9 → AV1）。
const pickEncoder = async (
  width: number,
  height: number,
  bitrate: number,
  framerate: number,
): Promise<{ codec: string; mux: "avc" | "hevc" | "vp9" | "av1" } | null> => {
  const candidates: { codec: string; mux: "avc" | "hevc" | "vp9" | "av1" }[] = [
    { codec: "avc1.640034", mux: "avc" }, // High 5.2（4K60まで）
    { codec: "hvc1.1.6.L153.B0", mux: "hevc" },
    { codec: "vp09.00.51.08", mux: "vp9" },
    { codec: "av01.0.13M.08", mux: "av1" },
  ];
  for (const c of candidates) {
    try {
      const s = await VideoEncoder.isConfigSupported({ codec: c.codec, width, height, bitrate, framerate });
      if (s.supported) return c;
    } catch {
      /* 未知コーデックは次の候補へ */
    }
  }
  return null;
};

export async function bakeVideoFast(opts: {
  videoUrl: string;
  // 編集で使ったポスター（回転適用後）の実寸。geom はこの座標系で計算されている。
  displayW: number;
  displayH: number;
  overlay: HTMLCanvasElement;
  geom: BakeGeom;
  onProgress: (ratio: number) => void;
}): Promise<Blob | null> {
  if (!canFastBake()) return null;
  const [MP4, MUX] = await Promise.all([import("mp4box"), import("mp4-muxer")]);
  const buf = await (await fetch(opts.videoUrl)).arrayBuffer();

  // --- コンテナ解析。全データをメモリに載せて一括でサンプル（エンコード済みフレーム）を集める ---
  const mp4 = MP4.createFile();
  const vsamples: Sample[] = [];
  const asamples: Sample[] = [];
  const info = await new Promise<Movie>((resolve, reject) => {
    let movie: Movie | null = null;
    mp4.onError = (module: string, message: string) => reject(new Error(`${module}: ${message}`));
    mp4.onReady = (m) => {
      movie = m;
      const v = m.videoTracks[0];
      if (!v) {
        reject(new Error("映像トラックがありません"));
        return;
      }
      mp4.setExtractionOptions(v.id, undefined, { nbSamples: 1000 });
      const a = m.audioTracks[0];
      if (a) mp4.setExtractionOptions(a.id, undefined, { nbSamples: 1000 });
      mp4.start();
    };
    mp4.onSamples = (id, _user, samples) => {
      if (!movie) return;
      (movie.videoTracks[0]?.id === id ? vsamples : asamples).push(...samples);
    };
    try {
      // 抽出はこの中で同期的に走り切る（データは全量手元にあるため）。
      mp4.appendBuffer(MP4.MP4BoxBuffer.fromArrayBuffer(buf, 0), true);
      mp4.flush();
      if (movie) resolve(movie);
      else reject(new Error("mp4 を解析できませんでした"));
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
  const vtrack = info.videoTracks[0];
  if (!vtrack || vsamples.length === 0) return null;

  // --- 回転と描画キャンバス。デコード結果は未回転なので、表示座標系へ起こしてから合成する ---
  const rot = rotationOf(vtrack.matrix);
  const disp = document.createElement("canvas");
  disp.width = opts.displayW;
  disp.height = opts.displayH;
  const dctx = disp.getContext("2d");
  const out = document.createElement("canvas");
  out.width = opts.overlay.width & ~1; // H.264系は奇数サイズを受けないことがあるため偶数に
  out.height = opts.overlay.height & ~1;
  const octx = out.getContext("2d");
  if (!dctx || !octx) return null;
  const g = opts.geom;
  const drawComposite = (frame: VideoFrame) => {
    dctx.save();
    if (rot === 90) {
      dctx.translate(disp.width, 0);
      dctx.rotate(Math.PI / 2);
    } else if (rot === 180) {
      dctx.translate(disp.width, disp.height);
      dctx.rotate(Math.PI);
    } else if (rot === 270) {
      dctx.translate(0, disp.height);
      dctx.rotate(-Math.PI / 2);
    }
    dctx.drawImage(frame, 0, 0, rot % 180 ? disp.height : disp.width, rot % 180 ? disp.width : disp.height);
    dctx.restore();
    octx.save();
    octx.scale(g.outScale, g.outScale);
    octx.drawImage(disp, g.cl, g.ct, g.cw, g.ch, g.mL, g.mT, g.cwR, g.chR);
    octx.restore();
    octx.drawImage(opts.overlay, 0, 0); // 文字・余白・ふちは全フレーム同じ
  };

  // --- ビットレートとエンコーダ選定。元動画のビットレート×1.5 を確保して劣化を抑える ---
  const durationSec = (info.duration / info.timescale) || vtrack.samples_duration / vtrack.timescale;
  const fps = Math.min(120, Math.max(1, Math.round(vsamples.length / Math.max(0.1, durationSec))));
  const srcBps = (buf.byteLength * 8) / Math.max(0.1, durationSec);
  const bitrate = Math.min(60_000_000, Math.max(8_000_000, Math.round(srcBps * 1.5)));
  const picked = await pickEncoder(out.width, out.height, bitrate, fps);
  if (!picked) return null;

  // --- 音声はコピー（AAC / Opus のみ。それ以外は音声なしで続行） ---
  const atrack = info.audioTracks[0] ?? null;
  const audio =
    atrack && asamples.length > 0
      ? atrack.codec.startsWith("mp4a")
        ? { codec: "aac" as const, description: aacDescription(mp4, atrack.id) }
        : /^opus/i.test(atrack.codec)
          ? { codec: "opus" as const, description: undefined }
          : null
      : null;

  const muxer = new MUX.Muxer({
    target: new MUX.ArrayBufferTarget(),
    video: { codec: picked.mux, width: out.width, height: out.height },
    ...(audio && atrack
      ? { audio: { codec: audio.codec, numberOfChannels: atrack.audio?.channel_count ?? 2, sampleRate: atrack.audio?.sample_rate ?? 44100 } }
      : {}),
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  // --- デコード → 合成 → エンコード。キューが詰まったら待つ（メモリを溢れさせない） ---
  let pipeError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { pipeError = e; },
  });
  encoder.configure({ codec: picked.codec, width: out.width, height: out.height, bitrate, framerate: fps });
  const keyEvery = Math.max(1, Math.round(fps * 2)); // 2秒ごとにキーフレーム
  let frameIndex = 0;
  const decoder = new VideoDecoder({
    output: (frame) => {
      drawComposite(frame);
      const vf = new VideoFrame(out, { timestamp: frame.timestamp, duration: frame.duration ?? undefined });
      frame.close();
      encoder.encode(vf, { keyFrame: frameIndex % keyEvery === 0 });
      vf.close();
      frameIndex++;
      opts.onProgress(Math.min(1, frameIndex / vsamples.length));
    },
    error: (e) => { pipeError = e; },
  });
  const needsDesc = /^(avc|hvc|hev)/.test(vtrack.codec);
  const desc = needsDesc ? videoDescription(MP4, mp4, vtrack.id) : undefined;
  if (needsDesc && !desc) return null;
  decoder.configure({
    codec: decoderCodec(vtrack.codec),
    codedWidth: vtrack.video?.width,
    codedHeight: vtrack.video?.height,
    ...(desc ? { description: desc } : {}),
  });

  const toUs = (v: number, timescale: number) => Math.round((v / timescale) * 1e6);
  try {
    for (const s of vsamples) {
      if (pipeError) throw pipeError;
      while (decoder.decodeQueueSize > 8 || encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 2));
      if (!s.data) continue;
      try {
        decoder.decode(
          new EncodedVideoChunk({
            type: s.is_sync ? "key" : "delta",
            timestamp: toUs(s.cts, s.timescale),
            duration: toUs(s.duration, s.timescale),
            data: s.data,
          }),
        );
      } catch (e) {
        throw pipeError ?? e; // デコーダが先に落ちていたら根本原因の方を投げる
      }
    }
    await decoder.flush();
    await encoder.flush();
    if (pipeError) throw pipeError;
    if (audio && atrack) {
      let first = true;
      for (const s of asamples) {
        if (!s.data) continue;
        muxer.addAudioChunkRaw(
          s.data,
          s.is_sync ? "key" : "delta",
          toUs(s.cts, s.timescale),
          toUs(s.duration, s.timescale),
          first
            ? {
                decoderConfig: {
                  codec: atrack.codec,
                  ...(audio.description ? { description: audio.description } : {}),
                  numberOfChannels: atrack.audio?.channel_count ?? 2,
                  sampleRate: atrack.audio?.sample_rate ?? 44100,
                },
              }
            : undefined,
        );
        first = false;
      }
    }
    muxer.finalize();
  } finally {
    try {
      decoder.close();
    } catch { /* すでに close 済みなら無視 */ }
    try {
      encoder.close();
    } catch { /* すでに close 済みなら無視 */ }
  }
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}
