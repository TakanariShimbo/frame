import { useEffect, useRef, useState } from "react";
import { IconSearch, IconImage, IconMountain, IconPlus } from "./icons";
import { searchMountains, loadMountainDescriptions, type MountainHit } from "../lib/mountains";
import { buildLabels, type ArLabel } from "../lib/labels";

type Props = {
  // 写真URLと、選んだ山＋辞書解説から作ったラベル列を渡して仕上げ画面へ。
  onStart: (photoUrl: string, labels: ArLabel[]) => void;
};

// 作例（テンプレ5種の完成例）。id は public/template-previews/{id}.jpg と Studio のテンプレに対応。
// テンプレの選択は写真追加後の仕上げ画面で行う。ここではあくまで「仕上がりのイメージ」。
const SHOWCASE: { id: string; name: string; sub: string }[] = [
  { id: "miyabi", name: "雅", sub: "定番・山名入り" },
  { id: "chou", name: "頂", sub: "センタータイトル" },
  { id: "katari", name: "語", sub: "解説つき" },
  { id: "ma", name: "間", sub: "余白を活かす" },
  { id: "sora", name: "空", sub: "縦構図・余白" },
];

// 入口画面: まず写真を追加し、そのあと山名を辞書から選ぶ（複数可）。
export default function Picker({ onStart }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MountainHit[]>([]);
  const [selected, setSelected] = useState<MountainHit[]>([]);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

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
    const descMap = await loadMountainDescriptions();
    const labels = buildLabels(selected, descMap);
    setLoading(false);
    onStart(photoUrl, labels);
  };

  const hasPhoto = photoUrl !== null;
  const canProceed = hasPhoto && selected.length > 0;
  const base = import.meta.env.BASE_URL;

  return (
    <div className="pick-screen">
      <div className="pick-inner">
        <header className="pick-head">
          <p className="kicker">Frame</p>
          <h1>山を、作品に。</h1>
          <p className="pick-lead">
            山の写真に山名・標高・解説を美しく重ねて、ポスターのような一枚に。
            約1,000座の山岳辞書から選ぶだけで、英名や解説も自動で添えられます。
          </p>
        </header>

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

        {/* 作例（仕上がりのイメージ。テンプレは仕上げ画面で選ぶ） */}
        <section className="pick-showcase" aria-label="作例（仕上がりのイメージ）">
          <header className="pick-showcase-head">
            <h2>作例</h2>
            <p>テンプレートで仕上げたサンプルです。テンプレートは写真追加後の仕上げ画面で選べます。</p>
          </header>
          <div className="pick-gallery">
            {SHOWCASE.map((g) => (
              <figure key={g.id} className="pick-gallery-item">
                <img
                  src={`${base}template-previews/${g.id}.jpg`}
                  alt={`テンプレート「${g.name}」の作例`}
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                />
                <figcaption>
                  <b>{g.name}</b>
                  <span>{g.sub}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <p className="pick-credit">
          山岳データ: 国土地理院「日本の主な山岳標高一覧」を加工 ／ 解説文は事実情報をもとにAIで生成
        </p>
      </div>
    </div>
  );
}
