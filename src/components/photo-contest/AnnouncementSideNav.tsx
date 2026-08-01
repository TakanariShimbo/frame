// 告知ページ PC 用の左サイド装飾ナビ（縦書き ANNOUNCEMENT / 年度 / SCROLL）。
// 参考画像に合わせた静的な装飾で、操作要素は持たない（本文の読み上げを妨げないよう aria-hidden）。
// 実際のセクション移動はスマホ右ナビと本文の見出し構造で担う。
export default function AnnouncementSideNav({ eyebrow, yearLabel }: { eyebrow: string; yearLabel: string }) {
  return (
    <nav className="pcan-side" aria-hidden>
      <span className="pcan-side-logo">
        YAMA FRAME
        <br />
        AWARD
      </span>
      <span className="pcan-side-rail">
        <span className="pcan-side-vtext">{eyebrow}</span>
        <span className="pcan-side-year">{yearLabel}</span>
        <span className="pcan-side-dot" />
      </span>
      <span className="pcan-side-scroll">SCROLL</span>
    </nav>
  );
}
