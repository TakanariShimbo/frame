import { useEffect, useState } from "react";
import { IconSearch, IconMountain, IconPlus } from "./icons";
import { searchMountains, loadDescriptionsFor, type MountainHit } from "../lib/mountains";
import { buildLabels, type ArLabel } from "../lib/labels";

type Props = {
  // いま仕上げる写真。山を選んだらラベル列を返して仕上げ画面へ。
  photoUrl: string;
  // この写真が何枚目か（1始まり）と全体の枚数（表示用）。
  photoIndex: number;
  photoTotal: number;
  onStart: (labels: ArLabel[]) => void;
  // 写真一覧へ戻る（この写真は「山を選ぶ」状態のまま残る）。
  onBoard: () => void;
};

// 山選び画面: 写真1枚ごとに通る。ホーム（写真選択）とは独立した専用ステップ。
export default function MountainPicker({ photoUrl, photoIndex, photoTotal, onStart, onBoard }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MountainHit[]>([]);
  const [selected, setSelected] = useState<MountainHit[]>([]);
  const [loading, setLoading] = useState(false);

  // 入力に対して山名を部分一致検索（デバウンス）。空クリアは onChange 側で行う。
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
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

  // 選び終えたら辞書解説を引いてラベルを組み立て、仕上げ画面へ。
  const onProceed = async () => {
    if (selected.length === 0 || loading) return;
    setLoading(true);
    const descMap = await loadDescriptionsFor(selected.map((m) => m.id));
    const labels = buildLabels(selected, descMap);
    setLoading(false);
    onStart(labels);
  };

  const canProceed = selected.length > 0;

  return (
    <div className="pick-screen">
      <div className="pick-inner">
        <header className="pick-next-head">
          <p className="kicker">Select</p>
          <h1>山を選ぶ</h1>
          <p>
            {photoTotal > 1 ? `${photoIndex} / ${photoTotal}枚目。` : ""}
            この写真にのせる山を選んでください。
          </p>
        </header>

        {/* 仕上げる写真（確認表示） */}
        <section className="pick-step">
          <header className="pick-step-head">
            <span className="pick-step-no">01</span>
            <h2>この写真を仕上げる</h2>
            {photoTotal > 1 && <span className="pick-step-note">残り{photoTotal - photoIndex}枚</span>}
          </header>
          <div className="pick-photo">
            <img className="pick-photo-img" src={photoUrl} alt="仕上げる写真" />
          </div>
        </section>

        {/* 山を選ぶ */}
        <section className="pick-step is-current">
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
              onChange={(e) => {
                setQuery(e.target.value);
                if (!e.target.value.trim()) setResults([]);
              }}
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
            {loading ? "読み込み中…" : "テーマを選んで仕上げへ"}
          </button>
          {!canProceed && <p className="pick-hint">山を1座以上選んでください。</p>}
        </section>

        <div className="pick-home-row">
          <button type="button" className="pick-photo-change" onClick={onBoard}>
            写真一覧へ
          </button>
        </div>
      </div>
    </div>
  );
}
