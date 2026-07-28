import { IconInstagram, IconX } from "../icons";
import type { AwardWinner } from "../../lib/photoContests";

// 受賞者名とSNSリンク。SNSは設定されているものだけ表示する
// （両方 / Xのみ / Instagramのみ / どちらも無し、のすべてに対応）。
export default function WinnerSocialLinks({ winner }: { winner: AwardWinner }) {
  return (
    <div className="pcw">
      <span className="pcw-label">受賞者</span>
      <span className="pcw-name">{winner.name}</span>
      {winner.x && (
        <a
          className="pcw-sns"
          href={winner.x.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${winner.name}のX（${winner.x.label}）を開く`}
        >
          <IconX size={13} className="pcw-icon" />
          <span className="pcw-handle">{winner.x.label}</span>
        </a>
      )}
      {winner.instagram && (
        <a
          className="pcw-sns"
          href={winner.instagram.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${winner.name}のInstagram（${winner.instagram.label}）を開く`}
        >
          <IconInstagram size={15} className="pcw-icon" />
          <span className="pcw-handle">{winner.instagram.label}</span>
        </a>
      )}
    </div>
  );
}
