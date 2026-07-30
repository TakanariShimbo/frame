type NavItem = { number: string; label: string };

type Props = {
  items: NavItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
};

// 告知ページ スマホ用の右側・縦型番号ナビ（01〜）。
// 番号は表示中セクション数から動的生成し、タップで対応セクションへ移動、
// スクロール位置に応じてアクティブを切り替える（一覧の横ナビ・結果の左ナビとは別構成）。
export default function AnnouncementMobileNav({ items, activeIndex, onSelect }: Props) {
  return (
    <nav className="pcan-mnav" aria-label="セクションナビゲーション">
      <ol className="pcan-mnav-list">
        {items.map((it, i) => (
          <li key={`${it.number}-${i}`}>
            <button
              type="button"
              className={`pcan-mnav-item${i === activeIndex ? " is-active" : ""}`}
              aria-current={i === activeIndex ? "true" : undefined}
              aria-label={`${it.number} ${it.label}へ移動`}
              onClick={() => onSelect(i)}
            >
              <span className="pcan-mnav-num" aria-hidden>
                {it.number}
              </span>
              <span className="pcan-mnav-dot" aria-hidden />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
