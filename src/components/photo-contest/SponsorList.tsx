import { IconGlobe, IconInstagram, IconX } from "../icons";
import { assetUrl, type Sponsor, type SponsorLinkType } from "../../lib/photoContests";

function LinkIcon({ type }: { type: SponsorLinkType }) {
  if (type === "instagram") return <IconInstagram size={15} className="pcan-sponsor-icon" />;
  if (type === "x") return <IconX size={13} className="pcan-sponsor-icon" />;
  if (type === "official") return <IconGlobe size={15} className="pcan-sponsor-icon" />;
  return null;
}

// 協賛ブランド一覧。各ブランドは Instagram・公式サイトなど複数のリンクを併記できる（links 配列）。
// リンク未確定（links が空）のブランドは名称だけを表示し、偽リンクは作らない。
// 後から JSON の links にURLを足すだけでリンクが増える。PC は横並び、スマホは縦積み（CSS 側）。
export default function SponsorList({ sponsors }: { sponsors: Sponsor[] }) {
  return (
    <ul className="pcan-sponsors">
      {sponsors.map((s, i) => (
        <li key={`${s.name}-${i}`} className="pcan-sponsor">
          <div className="pcan-sponsor-body">
            {s.logo ? (
              <img className="pcan-sponsor-logo" src={assetUrl(s.logo)} alt={s.name} loading="lazy" decoding="async" />
            ) : (
              <span className="pcan-sponsor-name">{s.name}</span>
            )}
            {s.links.length > 0 && (
              <div className="pcan-sponsor-links">
                {s.links.map((link, j) => (
                  <a
                    key={j}
                    className="pcan-sponsor-link"
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${s.name}の${link.label}を開く`}
                  >
                    <LinkIcon type={link.type} />
                    <span className="pcan-sponsor-label">{link.label}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
