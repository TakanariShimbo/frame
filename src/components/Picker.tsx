import { useRef } from "react";
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
// 作例モザイク（メーソンリー）の並び順。
const WORKS: string[] = WALL_COLS.flat();

// 入口画面: 写真を選ぶだけ（複数可）。山選び・テーマ選びは写真1枚ごとに次の画面で行う。
export default function Picker({ onPick }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);

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
        <div className="pick-mosaic-grid">
          {WORKS.map((w) => (
            <img key={w} src={`${base}home/works/${w}.jpg`} alt="作例" loading="lazy" />
          ))}
        </div>
        <p className="pick-credit">
          山岳データ: あにねこ氏「山名一覧 on the Web地図」(map.jpn.org)・国土地理院「日本の主な山岳標高一覧」を加工 ／ 解説文は事実情報をもとにAIで生成
        </p>
      </section>
    </div>
  );
}
