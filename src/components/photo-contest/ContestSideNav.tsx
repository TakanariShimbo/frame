export type SideNavItem = { number: string; label: string };

type Props = {
  // archive: 一覧ページのPC用（スマホでは非表示） / result: 結果ページ用（スマホでも幅を縮めて維持）
  variant: "archive" | "result";
  ariaLabel: string;
  // 結果ページで縦書き表示する年度
  yearLabel?: string;
  items: SideNavItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onLogoClick: () => void;
};

// 左側の縦型固定ナビゲーション（PC共通・結果ページはスマホでも維持）。
// 番号はデータ件数から動的に描画し、現在地はゴールドの番号＋ライン上の丸で示す。
export default function ContestSideNav({ variant, ariaLabel, yearLabel, items, activeIndex, onSelect, onLogoClick }: Props) {
  return (
    <nav className={`pcn pcn--${variant}`} aria-label={ariaLabel}>
      <button type="button" className="pcn-logo" onClick={onLogoClick} aria-label="YAMA FRAME AWARD">
        YAMA FRAME
        <br />
        AWARD
      </button>
      <div className="pcn-rail">
        {yearLabel && (
          <span className="pcn-year" aria-hidden>
            {yearLabel}
          </span>
        )}
        <ol className="pcn-list">
          {items.map((it, i) => (
            <li key={`${it.number}-${i}`}>
              <button
                type="button"
                className={`pcn-item${i === activeIndex ? " is-active" : ""}`}
                aria-current={i === activeIndex ? "true" : undefined}
                aria-label={`${it.number} ${it.label}へ移動`}
                onClick={() => onSelect(i)}
              >
                <span className="pcn-num" aria-hidden>
                  {it.number}
                </span>
                <span className="pcn-dot" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      </div>
      <span className="pcn-scroll" aria-hidden>
        SCROLL
      </span>
    </nav>
  );
}
