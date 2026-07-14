import { useEffect, useMemo, useRef, useState } from "react";
import { IconImage } from "./icons";

type Props = {
  // 選んだ写真URL列（先頭から順に仕上げる）を渡す。山選び・テーマ選びは次の画面で行う。
  onPick: (photoUrls: string[]) => void;
};

// 作例（public/home/works/{name}.jpg）。すべてこのアプリで書き出した完成品。
// ヒーローの「動く写真の壁」の列。縦横・明暗が混ざるように手で振り分けている。
// 同じ元写真の使い回しは1点に絞る（槍ヶ岳4種 → yari-panel、別山2種 → bessan-sky）。
// yari-climb は同じ槍ヶ岳でも別の写真（山荘へ下る登山者）なのでOK。
//
// 配置ルール（壁の見え方を決めるので崩さないこと）:
// - 白系（tanigawa / bessan-sky / tate-walk / utsukushigahara）は各列に1枚ずつ分散
// - ダーク系アンカー（akadake / tate-bird / kasagatake / iide）も各列に1枚ずつ
// - 列内は 暗 → 明 → 中間 の順。ループで先頭に戻っても明暗が交互になる
// - 縦長（akadake / tate-bird / kasagatake）は別々の列に
const WALL_COLS: string[][] = [
  ["akadake", "tanigawa", "jonen"],
  ["tate-bird", "utsukushigahara", "takamiishi-forest", "yari-panel"],
  ["kasagatake", "tate-walk", "asama"],
  ["iide", "yari-climb", "bessan-sky"],
];
// 作例モザイク。ar = 幅/高さ（列の高さ計算に使う。public/home/works の実寸から）。
// 列数はモニター幅で変わるため、基本セットに「ストック」を足し引きして
// 列の下端がいちばん揃う組み合わせを選ぶ。
type MosaicWork = { id: string; ar: number };
const MOSAIC_BASE: MosaicWork[] = [
  { id: "akadake", ar: 0.667 },
  { id: "tanigawa", ar: 1.501 },
  { id: "jonen", ar: 1.501 },
  { id: "tate-bird", ar: 0.667 },
  { id: "utsukushigahara", ar: 1.501 },
  { id: "takamiishi-forest", ar: 1.501 },
  { id: "yari-panel", ar: 1.357 },
  { id: "kasagatake", ar: 0.667 },
  { id: "tate-walk", ar: 1.78 },
  { id: "asama", ar: 2.353 },
  { id: "iide", ar: 1.501 },
  { id: "yari-climb", ar: 1.501 },
  { id: "bessan-sky", ar: 0.988 },
];
const MOSAIC_STOCK: MosaicWork[] = [
  { id: "takamiishi-stamp", ar: 0.667 },
  { id: "takamiishi-lake", ar: 1.78 },
  { id: "takamiishi-agepan", ar: 1.501 },
];
// 画像間の隙間ぶんの正規化高さ（2px ÷ 列幅~300px。full-bleed の詰めた隙間）。
const MOSAIC_GAP = 0.007;

// 貪欲法（次の1枚をいちばん低い列へ）で列に割り付け、下端の凸凹（最大-最小）を返す。
function packMosaic(works: MosaicWork[], nCols: number): { cols: MosaicWork[][]; spread: number } {
  const cols: MosaicWork[][] = Array.from({ length: nCols }, () => []);
  const hs = new Array<number>(nCols).fill(0);
  for (const w of works) {
    let k = 0;
    for (let i = 1; i < nCols; i++) if (hs[i] < hs[k] - 1e-9) k = i;
    cols[k].push(w);
    hs[k] += 1 / w.ar + MOSAIC_GAP;
  }
  return { cols, spread: Math.max(...hs) - Math.min(...hs) };
}

// ストックの使う/使わない × 並べ方（元順の回転＋背の高い順）を総当たりし、
// 下端がいちばん揃う組み合わせを選ぶ（同点なら枚数が多い方）。
function bestMosaic(nCols: number): MosaicWork[][] {
  let best: { cols: MosaicWork[][]; spread: number; count: number } | null = null;
  const consider = (works: MosaicWork[], count: number) => {
    const packed = packMosaic(works, nCols);
    if (!best || packed.spread < best.spread - 1e-9 || (Math.abs(packed.spread - best.spread) < 1e-9 && count > best.count)) {
      best = { ...packed, count };
    }
  };
  for (let mask = 0; mask < 1 << MOSAIC_STOCK.length; mask++) {
    const works = [...MOSAIC_BASE, ...MOSAIC_STOCK.filter((_, i) => mask & (1 << i))];
    // 元の並びを保った回転（近所関係を崩さない）
    for (let s = 0; s < works.length; s++) consider([...works.slice(s), ...works.slice(0, s)], works.length);
    // 背の高い順（LPTスケジューリング。揃いやすさ最優先の候補）
    consider([...works].sort((a, b) => 1 / b.ar - 1 / a.ar), works.length);
  }
  return best!.cols;
}

// 入口画面: 写真を選ぶだけ（複数可）。山選び・テーマ選びは写真1枚ごとに次の画面で行う。
export default function Picker({ onPick }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const mosaicRef = useRef<HTMLDivElement | null>(null);

  // モザイクの列数（コンテナ幅から算出。1〜4列）。
  const [mosaicCols, setMosaicCols] = useState(4);
  useEffect(() => {
    const el = mosaicRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setMosaicCols(Math.max(1, Math.min(4, Math.floor((w + 2) / (240 + 2)))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const mosaic = useMemo(() => bestMosaic(mosaicCols), [mosaicCols]);

  // 写真を選んだら即、1枚目の山選びへ進む。
  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => !f.type || f.type.startsWith("image/"));
    e.target.value = ""; // 同じファイルを連続で選べるようリセット
    if (files.length === 0) {
      if (e.target.files?.length) alert("画像ファイルを選んでください（JPEG / PNG など）。");
      return;
    }
    onPick(files.map((f) => URL.createObjectURL(f)));
  };

  const base = import.meta.env.BASE_URL;

  return (
    <div className="pick-screen">
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onPickPhoto} />

      {/* ヒーロー: 作例を敷き詰めた「動く写真の壁」。列ごとに逆方向へゆっくり流れる */}
      <section className="pick-hero">
        <div className="pick-wall" aria-hidden="true">
          {WALL_COLS.map((col, i) => (
            <div key={i} className="pick-wall-col" style={{ animationDuration: `${110 + i * 16}s` }}>
              {/* -50%移動でループするため前半と後半を同一に。縦長画面でも切れないよう8回繰り返す */}
              {Array.from({ length: 8 })
                .flatMap(() => col)
                .map((w, j) => (
                  <img key={j} src={`${base}home/works/${w}.jpg`} alt="" />
                ))}
            </div>
          ))}
        </div>
        <div className="pick-hero-veil" aria-hidden="true" />
        <div className="pick-hero-content">
          <p className="kicker">Frame</p>
          <h1>山を、作品に。</h1>
          <p className="pick-lead">
            山の写真に山名・標高・解説を美しく重ねて、ポスターのような一枚に。
            約27,000座の山岳辞書から選ぶだけで、英名や解説も自動で添えられます。
          </p>
          <button type="button" className="pick-hero-cta" onClick={() => fileRef.current?.click()}>
            <IconImage size={18} />
            写真を選んではじめる
          </button>
          <p className="pick-hero-note">複数選ぶと、1枚ずつ順に仕上げられます。</p>
        </div>
        <div className="pick-hero-scroll" aria-hidden="true" />
      </section>

      {/* 作例モザイク: 全作品をメーソンリーで大きく見せる */}
      <section className="pick-mosaic" aria-label="作例">
        <header className="pick-mosaic-head">
          <h2>作例</h2>
          <p>すべてこのアプリで仕上げた一枚。テーマ（テンプレート）は写真ごとに選べます。</p>
        </header>
        <div className="pick-mosaic-grid" ref={mosaicRef}>
          {mosaic.map((col, i) => (
            <div key={i} className="pick-mosaic-col">
              {col.map((w) => (
                <img key={w.id} src={`${base}home/works/${w.id}.jpg`} alt="作例" loading="lazy" />
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
