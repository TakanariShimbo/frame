import { IconInstagram, IconThreads, IconX } from "../icons";
import type { MentionAccount, PlatformKey } from "../../lib/photoContests";

const META: Record<PlatformKey, { label: string; Icon: typeof IconX }> = {
  x: { label: "X", Icon: IconX },
  instagram: { label: "Instagram", Icon: IconInstagram },
  threads: { label: "Threads", Icon: IconThreads },
};

const ORDER: PlatformKey[] = ["x", "instagram", "threads"];

// メンション先の「指定アカウント」を表示する。url があればリンク、無ければ表示名のみ。
// アカウントが1件も設定されていなければ pendingMessage（未確定案内）を表示する（偽リンクは出さない）。
export default function MentionAccounts({
  accounts,
  pendingMessage,
}: {
  accounts: Record<PlatformKey, MentionAccount | null>;
  pendingMessage: string;
}) {
  const entries = ORDER.map((k) => [k, accounts[k]] as const).filter((e): e is readonly [PlatformKey, MentionAccount] => Boolean(e[1]));

  if (entries.length === 0) {
    return <p className="pcan-mention pcan-mention-pending">{pendingMessage}</p>;
  }

  return (
    <div className="pcan-mention">
      <p className="pcan-mention-label">指定アカウント</p>
      <ul className="pcan-mention-list">
        {entries.map(([k, acc]) => {
          const { label, Icon } = META[k];
          const inner = (
            <>
              <Icon size={14} className="pcan-mention-icon" />
              <span className="pcan-mention-handle">{acc.label}</span>
            </>
          );
          return (
            <li key={k} className="pcan-mention-item">
              {acc.url ? (
                <a className="pcan-mention-link" href={acc.url} target="_blank" rel="noopener noreferrer" aria-label={`${label}の指定アカウント（${acc.label}）を開く`}>
                  {inner}
                </a>
              ) : (
                <span className="pcan-mention-link">{inner}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
