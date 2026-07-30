import { IconGlobe, IconInstagram, IconX } from "../icons";
import { assetUrl, type Sponsor, type SponsorLinkType } from "../../lib/photoContests";

function LinkIcon({ type }: { type: SponsorLinkType }) {
  if (type === "instagram") return <IconInstagram size={15} className="pcan-sponsor-icon" />;
  if (type === "x") return <IconX size={13} className="pcan-sponsor-icon" />;
  if (type === "official") return <IconGlobe size={15} className="pcan-sponsor-icon" />;
  return null;
}

// 協賛ブランド1件の中身（ロゴ or 名称 ＋ リンク種別ラベル）。
function SponsorInner({ sponsor }: { sponsor: Sponsor }) {
  return (
    <>
      {sponsor.logo ? (
        <img className="pcan-sponsor-logo" src={assetUrl(sponsor.logo)} alt={sponsor.name} loading="lazy" decoding="async" />
      ) : (
        <span className="pcan-sponsor-name">{sponsor.name}</span>
      )}
      {sponsor.linkType !== "none" && (
        <span className="pcan-sponsor-meta">
          <LinkIcon type={sponsor.linkType} />
          <span className="pcan-sponsor-label">{sponsor.linkLabel}</span>
          <span className="pcan-sponsor-arrow" aria-hidden />
        </span>
      )}
    </>
  );
}

// 協賛ブランド一覧。URL 未確定（null）のブランドはリンクにせずプレーン表示する（偽リンクを作らない）。
// 後から JSON に url を入れるだけでリンク化される。PC は横並び、スマホは縦積み（CSS 側）。
export default function SponsorList({ sponsors }: { sponsors: Sponsor[] }) {
  return (
    <ul className="pcan-sponsors">
      {sponsors.map((s, i) => (
        <li key={`${s.name}-${i}`} className="pcan-sponsor">
          {s.url ? (
            <a
              className="pcan-sponsor-body is-link"
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${s.name}の${s.linkLabel}を開く`}
            >
              <SponsorInner sponsor={s} />
            </a>
          ) : (
            <div className="pcan-sponsor-body">
              <SponsorInner sponsor={s} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
