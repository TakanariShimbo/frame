import { IconInstagram, IconThreads, IconX } from "../icons";
import type { PlatformKey } from "../../lib/photoContests";

const META: Record<PlatformKey, { label: string; Icon: typeof IconX }> = {
  x: { label: "X", Icon: IconX },
  instagram: { label: "Instagram", Icon: IconInstagram },
  threads: { label: "Threads", Icon: IconThreads },
};

// 応募プラットフォーム（X / Instagram / Threads）の一覧表示。
// これは「対応プラットフォームの提示」であり個別リンクではないため、非リンクのアイコン＋名称で描画する。
export default function PlatformLinks({ platforms }: { platforms: PlatformKey[] }) {
  const items = platforms.filter((p) => META[p]);
  return (
    <ul className="pcan-platforms">
      {items.map((p) => {
        const { label, Icon } = META[p];
        return (
          <li key={p} className="pcan-platform">
            <Icon size={18} className="pcan-platform-icon" />
            <span className="pcan-platform-name">{label}</span>
          </li>
        );
      })}
    </ul>
  );
}
