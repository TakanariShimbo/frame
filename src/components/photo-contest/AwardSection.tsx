import type { Award } from "../../lib/photoContests";
import ContestPicture from "./ContestPicture";
import WinnerSocialLinks from "./WinnerSocialLinks";

type Props = {
  award: Award;
  index: number;
  // 1作品目（ヒーロー）のみ、ページのコンセプトコピーとコンテスト説明を左側へ添える
  concept?: string[];
  contestDescription?: string;
  sectionRef: (el: HTMLElement | null) => void;
};

// 受賞作品1件。データ件数に依存しない汎用構造で、
// index=0 はファーストビュー（賞名見出し＋3領域）、以降はテキスト＋画像のバリエーション。
// スマホでは共通して「(賞名)→画像→番号と作品情報→受賞者→区切り線」の縦並びになる（CSS側で再構成）。
export default function AwardSection({ award, index, concept, contestDescription, sectionRef }: Props) {
  const hero = index === 0;
  const detail = (
    <div className="pcr-detail" data-reveal>
      {!hero && <p className="pcr-eyebrow">{award.prizeName}</p>}
      <div className="pcr-numblock">
        <span className="pcr-num">{award.number}</span>
        <span className="pcr-numline" aria-hidden />
      </div>
      <div className="pcr-text">
        <h2 className="pcr-title">{award.title}</h2>
        {award.copy && <p className="pcr-copy">{award.copy}</p>}
        <p className="pcr-desc">{award.description}</p>
      </div>
      <WinnerSocialLinks winner={award.winner} />
    </div>
  );

  if (hero) {
    return (
      <section ref={sectionRef} id={`award-${award.id}`} className="pcr-award pcr-award--hero">
        <p className="pcr-prize" data-reveal>
          <span className="pcr-prize-name">{award.prizeName}</span>
        </p>
        <div className="pcr-hero">
          <div className="pcr-media" data-reveal>
            <ContestPicture image={award.image} priority />
          </div>
          {detail}
          {(concept?.length || contestDescription) && (
            <div className="pcr-concept" data-reveal>
              {concept && concept.length > 0 && (
                <p className="pcr-concept-copy">
                  {concept.map((line, i) => (
                    <span key={i} className="pcr-concept-line">
                      {line}
                    </span>
                  ))}
                </p>
              )}
              {contestDescription && <p className="pcr-concept-desc">{contestDescription}</p>}
              <span className="pcr-goldline" aria-hidden />
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section ref={sectionRef} id={`award-${award.id}`} className="pcr-award">
      <div className="pcr-body">
        <div className="pcr-media" data-reveal>
          <ContestPicture image={award.image} />
        </div>
        {detail}
      </div>
    </section>
  );
}
