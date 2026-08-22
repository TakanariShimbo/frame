// 告知ページの大セクション見出し（協賛ブランド／景品）。
// 「英字ラベル ＋ 短い金線 ＋ 和文見出し」を縦積み中央で揃え、セクション間で形式を統一する。
// 見出しレベルは h2 固定。id を渡すと aria-labelledby から参照できる。
export default function SectionHead({ eyebrow, title, titleId }: { eyebrow: string; title: string; titleId?: string }) {
  return (
    <div className="pcan-sechead">
      <span className="pcan-sechead-eyebrow">{eyebrow}</span>
      <span className="pcan-sechead-line" aria-hidden />
      <h2 id={titleId} className="pcan-sechead-title">
        {title}
      </h2>
    </div>
  );
}
