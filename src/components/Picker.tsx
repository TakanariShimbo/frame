import { useEffect, useRef, useState } from "react";
import { IconSearch, IconImage, IconMountain, IconPlus } from "./icons";
import { searchMountains, loadDescriptionsFor, type MountainHit } from "../lib/mountains";
import { buildLabels, type ArLabel } from "../lib/labels";

type Props = {
  // 写真URLと、選んだ山＋辞書解説から作ったラベル列を渡して仕上げ画面へ。
  onStart: (photoUrl: string, labels: ArLabel[]) => void;
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

// 入口画面: まず写真を追加し、そのあと山名を辞書から選ぶ（複数可）。
export default function Picker({ onStart }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MountainHit[]>([]);
  const [selected, setSelected] = useState<MountainHit[]>([]);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const stepsRef = useRef<HTMLDivElement | null>(null);

  // ヒーローのCTAから写真を選んだら、フロー（ステップ）まで自動でスクロールする。
  useEffect(() => {
    if (photoUrl) stepsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [photoUrl]);

  // 入力に対して山名を部分一致検索（デバウンス）。
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(() => {
      searchMountains(q, 12).then((hits) => {
        if (!cancelled) setResults(hits);
      });
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [query]);

  const isSelected = (id: number) => selected.some((m) => m.id === id);
  const addMountain = (m: MountainHit) => {
    if (!isSelected(m.id)) setSelected((p) => [...p, m]);
  };
  const removeMountain = (id: number) => setSelected((p) => p.filter((m) => m.id !== id));

  // STEP 01: 写真を選ぶ（選び直しも可。前のURLは解放する）。
  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 同じファイルを連続で選べるようリセット
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      alert("画像ファイルを選んでください（JPEG / PNG など）。");
      return;
    }
    setPhotoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  // STEP 02 完了後: 辞書解説を引いてラベルを組み立て、仕上げ画面へ。
  const onProceed = async () => {
    if (!photoUrl || selected.length === 0 || loading) return;
    setLoading(true);
    const descMap = await loadDescriptionsFor(selected.map((m) => m.id));
    const labels = buildLabels(selected, descMap);
    setLoading(false);
    onStart(photoUrl, labels);
  };

  const hasPhoto = photoUrl !== null;
  const canProceed = hasPhoto && selected.length > 0;
  const base = import.meta.env.BASE_URL;

  return (
    <div className="pick-screen">
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
            写真を追加してはじめる
          </button>
        </div>
        <div className="pick-hero-scroll" aria-hidden="true" />
      </section>

      {/* 作例モザイク: 全作品をメーソンリーで大きく見せる */}
      <section className="pick-mosaic" aria-label="作例">
        <header className="pick-mosaic-head">
          <h2>作例</h2>
          <p>すべてこのアプリで仕上げた一枚。テンプレートは仕上げ画面で選べます。</p>
        </header>
        <div className="pick-mosaic-grid">
          {WORKS.map((w) => (
            <img key={w} src={`${base}home/works/${w}.jpg`} alt="作例" loading="lazy" />
          ))}
        </div>
      </section>

      <div className="pick-inner" ref={stepsRef}>
        {/* STEP 01: 写真を追加する（メイン導線） */}
        <section className={`pick-step${hasPhoto ? "" : " is-current"}`}>
          <header className="pick-step-head">
            <span className="pick-step-no">01</span>
            <h2>写真を追加する</h2>
            <span className="pick-step-note">端末の写真から</span>
          </header>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickPhoto} />
          {hasPhoto ? (
            <div className="pick-photo">
              <img className="pick-photo-img" src={photoUrl} alt="追加した写真" />
              <button type="button" className="pick-photo-change" onClick={() => fileRef.current?.click()}>
                写真を選び直す
              </button>
            </div>
          ) : (
            <button type="button" className="pick-pick-btn" onClick={() => fileRef.current?.click()}>
              <IconImage size={18} />
              写真を追加する
            </button>
          )}
        </section>

        {/* STEP 02: 山を選ぶ */}
        <section className={`pick-step${hasPhoto ? " is-current" : ""}`}>
          <header className="pick-step-head">
            <span className="pick-step-no">02</span>
            <h2>山を選ぶ</h2>
            <span className="pick-step-note">複数選べます</span>
          </header>

          <div className="pick-search">
            <IconSearch size={16} className="pick-search-ico" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="山名・読みで検索（例: 富士山 / ふじ）"
              aria-label="山名で検索"
              autoComplete="off"
            />
          </div>

          {results.length > 0 && (
            <ul className="pick-results">
              {results.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`pick-result${isSelected(m.id) ? " is-added" : ""}`}
                    onClick={() => addMountain(m)}
                    disabled={isSelected(m.id)}
                  >
                    <IconMountain size={16} className="pick-result-ico" />
                    <span className="pick-result-name">{m.name}</span>
                    <span className="pick-result-meta">
                      {Math.round(m.elevationM).toLocaleString()}m
                      {m.prefecture ? ` ・ ${m.prefecture.replace(/\//g, "・")}` : ""}
                    </span>
                    <span className="pick-result-add">{isSelected(m.id) ? "追加済み" : <IconPlus size={16} />}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* 選んだ山（複数可。写真に載せる順＝既定の並び順） */}
          <div className="pick-selected">
            <div className="pick-selected-head">
              <span>のせる山</span>
              <span className="pick-selected-count">{selected.length}座</span>
            </div>
            {selected.length === 0 ? (
              <p className="pick-selected-empty">まだ選ばれていません。上の検索から山を追加してください。</p>
            ) : (
              <ul className="pick-chips">
                {selected.map((m) => (
                  <li key={m.id} className="pick-chip">
                    <span className="pick-chip-name">{m.name}</span>
                    <span className="pick-chip-elev">{Math.round(m.elevationM).toLocaleString()}m</span>
                    <button
                      type="button"
                      className="pick-chip-x"
                      onClick={() => removeMountain(m.id)}
                      aria-label={`${m.name}を外す`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button type="button" className="pick-pick-btn" disabled={!canProceed || loading} onClick={onProceed}>
            {loading ? "読み込み中…" : "仕上げへ進む"}
          </button>
          {!canProceed && (
            <p className="pick-hint">{hasPhoto ? "山を1座以上選んでください。" : "まず写真を追加してください。"}</p>
          )}
        </section>

        <p className="pick-credit">
          山岳データ: あにねこ氏「山名一覧 on the Web地図」(map.jpn.org)・国土地理院「日本の主な山岳標高一覧」を加工 ／ 解説文は事実情報をもとにAIで生成
        </p>
      </div>
    </div>
  );
}
