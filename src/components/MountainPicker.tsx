import { useEffect, useRef, useState } from "react";
import { useModeT } from "../lib/useModeT";
import { IconSearch, IconMountain, IconPlus } from "./icons";
import { searchMountains, loadDescriptionsFor, type MountainHit } from "../lib/mountains";
import { buildLabels, type ArLabel, type PickedPlace } from "../lib/labels";
import { formatElev } from "../lib/mode";

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
  const { t } = useModeT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MountainHit[]>([]);
  const [selected, setSelected] = useState<PickedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  // 自由入力の採番。辞書idと衝突しないよう負の値を使う。
  const customIdRef = useRef(-1);

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
    if (!isSelected(m.id))
      setSelected((p) => [...p, { id: m.id, name: m.name, nameEn: m.nameEn, elevationM: m.elevationM, prefecture: m.prefecture }]);
  };
  // 自由入力（山小屋・池・地名・通称など）。検索欄の文字列をそのまま名前として追加する。
  const addCustom = () => {
    const name = query.trim();
    if (!name) return;
    setSelected((p) => [...p, { id: customIdRef.current--, name, custom: true }]);
    setQuery("");
    setResults([]);
  };
  // 自由入力チップの英語名（任意）。空なら未設定＝英語表示の場面では日本語名で代用される。
  const setCustomNameEn = (id: number, raw: string) => {
    const v = raw.trim() === "" ? undefined : raw;
    setSelected((p) => p.map((m) => (m.id === id ? { ...m, nameEn: v } : m)));
  };
  // 自由入力チップの標高（任意）。空にすれば未設定＝標高表示なしに戻る。
  const setCustomElev = (id: number, raw: string) => {
    const v = raw.trim() === "" ? undefined : Number(raw);
    setSelected((p) =>
      p.map((m) => (m.id === id ? { ...m, elevationM: v != null && Number.isFinite(v) ? v : undefined } : m)),
    );
  };
  const removeMountain = (id: number) => setSelected((p) => p.filter((m) => m.id !== id));

  // 選び終えたら辞書解説を引いてラベルを組み立て、仕上げ画面へ（自由入力に辞書解説は無い）。
  const onProceed = async () => {
    if (selected.length === 0 || loading) return;
    setLoading(true);
    const descMap = await loadDescriptionsFor(selected.filter((m) => !m.custom).map((m) => m.id));
    const labels = buildLabels(selected, descMap);
    setLoading(false);
    onStart(labels);
  };

  const canProceed = selected.length > 0;

  return (
    <div className="pick-screen">
      {/* 写真は画面幅いっぱいのヒーローに。ぼかした同じ写真を下敷きにして全体を見せる */}
      <div className="mtn-hero">
        <img className="mtn-hero-back" src={photoUrl} alt="" aria-hidden="true" />
        <img className="mtn-hero-img" src={photoUrl} alt={t("mountainPicker.finishingPhotoAlt")} />
        <div className="mtn-hero-veil" aria-hidden="true" />
        <header className="mtn-hero-head">
          <p className="kicker">Select</p>
          <h1>{t("mountainPicker.heading")}</h1>
          <p>
            {photoTotal > 1 ? t("mountainPicker.photoCounter", { index: photoIndex, total: photoTotal }) : ""}
            {t("mountainPicker.instruction")}
          </p>
        </header>
      </div>

      <div className="mtn-body">
        <div className="pick-search">
          <IconSearch size={16} className="pick-search-ico" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value.trim()) setResults([]);
            }}
            placeholder={t("mountainPicker.searchPlaceholder")}
            aria-label={t("mountainPicker.searchLabel")}
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
                    {m.id >= 9_000_000 ? `${t("mountainPicker.featuredTag")} ・ ` : ""}
                    {formatElev(m.elevationM)}
                    {m.prefecture ? ` ・ ${m.prefecture.replace(/\//g, "・")}` : ""}
                  </span>
                  <span className="pick-result-add">{isSelected(m.id) ? t("mountainPicker.added") : <IconPlus size={16} />}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* 自由入力: 検索中はいつでも、入力した文字列をそのまま名前として使える
            （山小屋・池・地名・通称など、辞書に無い名前のための逃げ道）。 */}
        {query.trim() && (
          <button type="button" className="pick-result pick-result--custom" onClick={addCustom}>
            <IconPlus size={16} className="pick-result-ico" />
            <span className="pick-result-name">{t("mountainPicker.useAsIs", { query: query.trim() })}</span>
            <span className="pick-result-meta">{t("mountainPicker.freeInputHint")}</span>
          </button>
        )}

        {/* 選んだ山（複数可。写真に載せる順＝既定の並び順） */}
        <div className="pick-selected">
          <div className="pick-selected-head">
            <span>{t("mountainPicker.selectedHeading")}</span>
            <span className="pick-selected-count">{t("mountainPicker.selectedCount", { count: selected.length })}</span>
          </div>
          {selected.length === 0 ? (
            <p className="pick-selected-empty">{t("mountainPicker.selectedEmpty")}</p>
          ) : (
            <ul className="pick-chips">
              {selected.map((m) => (
                <li key={m.id} className={`pick-chip${m.custom ? " pick-chip--custom" : ""}`}>
                  <span className="pick-chip-name">{m.name}</span>
                  {m.custom ? (
                    // 自由入力は英語名と標高を任意で入れられる
                    // （空のままなら英語表示は日本語名で代用・標高表示なしで仕上がる）。
                    <span className="pick-chip-custom-fields">
                      <input
                        type="text"
                        className="pick-chip-input pick-chip-input--en"
                        placeholder={t("mountainPicker.nameEnPlaceholder")}
                        value={m.nameEn ?? ""}
                        onChange={(e) => setCustomNameEn(m.id, e.target.value)}
                        aria-label={t("mountainPicker.nameEnLabel", { name: m.name })}
                        autoComplete="off"
                      />
                      <span className="pick-chip-elev pick-chip-elev--input">
                        <input
                          type="number"
                          className="pick-chip-input"
                          inputMode="numeric"
                          placeholder={t("mountainPicker.elevationPlaceholder")}
                          value={m.elevationM ?? ""}
                          onChange={(e) => setCustomElev(m.id, e.target.value)}
                          aria-label={t("mountainPicker.elevationLabel", { name: m.name })}
                        />
                        m
                      </span>
                    </span>
                  ) : (
                    m.elevationM != null && (
                      <span className="pick-chip-elev">{formatElev(m.elevationM)}</span>
                    )
                  )}
                  <button
                    type="button"
                    className="pick-chip-x"
                    onClick={() => removeMountain(m.id)}
                    aria-label={t("mountainPicker.removeLabel", { name: m.name })}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button type="button" className="pick-pick-btn" disabled={!canProceed || loading} onClick={onProceed}>
          {loading ? t("mountainPicker.loading") : t("mountainPicker.proceed")}
        </button>
        {!canProceed && <p className="pick-hint">{t("mountainPicker.proceedHint")}</p>}

        <div className="pick-home-row">
          <button type="button" className="pick-photo-change" onClick={onBoard}>
            {t("mountainPicker.backToBoard")}
          </button>
        </div>
      </div>
    </div>
  );
}
