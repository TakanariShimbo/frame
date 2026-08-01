import type { SideNavItem } from "./ContestSideNav";

type Props = {
  items: SideNavItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
};

// 一覧ページのスマートフォン専用・横方向の番号ナビゲーション。
// 幅に収まらないときは（スクロールバーを見せずに）横スクロールできる。
export default function ArchiveMobileNav({ items, activeIndex, onSelect }: Props) {
  return (
    <nav className="pchn" aria-label="開催コンテストナビゲーション">
      <ol className="pchn-list">
        {items.map((it, i) => (
          <li key={`${it.number}-${i}`} className="pchn-cell">
            <button
              type="button"
              className={`pchn-item${i === activeIndex ? " is-active" : ""}`}
              aria-current={i === activeIndex ? "true" : undefined}
              aria-label={`${it.number} ${it.label}へ移動`}
              onClick={() => onSelect(i)}
            >
              <span className="pchn-num" aria-hidden>
                {it.number}
              </span>
              <span className="pchn-dot" aria-hidden />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
