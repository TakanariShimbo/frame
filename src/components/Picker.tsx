import { useEffect, useRef, useState } from "react";
import { IconSearch, IconImage, IconMountain, IconPlus } from "./icons";
import { searchMountains, loadMountainDescriptions, type MountainHit } from "../lib/mountains";
import { buildLabels, type ArLabel } from "../lib/labels";

type Props = {
  // 写真URLと、選んだ山＋辞書解説から作ったラベル列を渡して仕上げ画面へ。
  onStart: (photoUrl: string, labels: ArLabel[]) => void;
};

// 入口画面: 山名を辞書から選び（複数可）、写真をのせる。
export default function Picker({ onStart }: Props) {
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

  // 写真を選んだら、辞書解説を引いてラベルを組み立て、仕上げ画面へ。
  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 同じファイルを連続で選べるようリセット
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      alert("画像ファイルを選んでください（JPEG / PNG など）。");
      return;
    }
    setLoading(true);
    const descMap = await loadMountainDescriptions();
    const labels = buildLabels(selected, descMap);
    const url = URL.createObjectURL(file);
    setLoading(false);
    onStart(url, labels);
  };

  const canPickPhoto = selected.length > 0;

  return (
    <div className="pick-screen">
      <div className="pick-inner">
        <header className="pick-head">
          <span className="pick-head-ico">
            <IconImage size={26} />
          </span>
          <h1>山を写す</h1>
          <p>山名を選んで写真をのせると、名前や解説を重ねて一枚に仕上げます。</p>
        </header>

        {/* 山名検索 */}
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

        {/* 検索結果 */}
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

        {/* 写真をのせる */}
        <div className="pick-foot">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickPhoto} />
          <button
            type="button"
            className="pick-pick-btn"
            disabled={!canPickPhoto || loading}
            onClick={() => fileRef.current?.click()}
          >
            <IconImage size={18} />
            {loading ? "読み込み中…" : "写真を選ぶ"}
          </button>
          {!canPickPhoto && <p className="pick-hint">まず山を1座以上選んでください。</p>}
        </div>
      </div>
    </div>
  );
}
