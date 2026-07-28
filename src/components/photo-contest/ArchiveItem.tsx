import type { ArchiveContest } from "../../lib/photoContests";
import AppLink from "./AppLink";
import ContestPicture from "./ContestPicture";

type Props = {
  contest: ArchiveContest;
  index: number;
  sectionRef: (el: HTMLElement | null) => void;
};

// 一覧の1コンテスト。最新（isLatest）は大きく、過去年度は配列の並び順から
// 画像とテキストを左右交互に配置する。スマホでは画像へ文字を重ねる構成（CSS側）。
export default function ArchiveItem({ contest, index, sectionRef }: Props) {
  const side = index % 2 === 1 ? "pca-item--flip" : "";
  const cls = contest.isLatest ? "pca-item pca-item--latest" : `pca-item ${side}`.trim();
  return (
    <section ref={sectionRef} id={`contest-${contest.year}`} className={cls} data-reveal>
      <AppLink to={`/photo-contest/${contest.year}`} className="pca-link" aria-label={`${contest.year} ${contest.title} の結果を見る`}>
        <div className="pca-media">
          <ContestPicture image={contest.coverImage} priority={index === 0} />
          <span className="pca-shade" aria-hidden />
        </div>
        <div className="pca-info">
          {contest.isLatest && <span className="pca-latest">LATEST</span>}
          <span className="pca-year">{contest.year}</span>
          <h2 className="pca-title">{contest.title}</h2>
          <p className="pca-desc">{contest.description}</p>
          <span className="pca-cta">
            VIEW RESULTS
            <span className="pca-arrow" aria-hidden />
          </span>
        </div>
      </AppLink>
    </section>
  );
}
