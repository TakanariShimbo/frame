import { IconChevron } from "../icons";
import type { Prize } from "../../lib/photoContests";
import ContestPicture from "./ContestPicture";

// 景品一覧（写真集的な縦積みエディトリアルレイアウト）。
// PC は奇数/偶数で画像とテキストの左右を入れ替える（CSSの nth-child で切り替え）。
// 画像は1枚以上。2枚目がある場合の組み方は imageLayout で切り替える（カルーセルは使わない）。
//   inset（既定）: 同じ製品の別カット。1枚目に2枚目を小さく重ねる。
//   pair:          別々の製品2点。2枚を左右等分で対等に並べる。
export default function PrizeList({ prizes, sourceLinkLabel }: { prizes: Prize[]; sourceLinkLabel: string }) {
  return (
    <ol className="pcan-prizes">
      {prizes.map((prize, i) => {
        const [main, sub] = prize.images;
        const isPair = sub != null && prize.imageLayout === "pair";
        return (
          <li key={prize.id} className="pcan-prize">
            <div className={isPair ? "pcan-prize-media pcan-prize-media-pair" : "pcan-prize-media"}>
              <ContestPicture image={main} className="pcan-prize-img-main" />
              {sub && <ContestPicture image={sub} className={isPair ? "pcan-prize-img-pair" : "pcan-prize-img-sub"} />}
            </div>
            <div className="pcan-prize-body">
              <span className="pcan-prize-num" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="pcan-prize-brand">{prize.brand}</p>
              <h3 className="pcan-prize-name">{prize.name}</h3>
              <div className="pcan-prize-desc">
                {prize.description.map((paragraph, j) => (
                  <p key={j}>{paragraph}</p>
                ))}
              </div>
              <a
                className="pcan-prize-link"
                href={prize.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${prize.brand} ${prize.name}の紹介投稿をXで見る（外部サイトが開きます）`}
              >
                {sourceLinkLabel}
                <IconChevron dir="right" size={12} className="pcan-prize-link-icon" />
              </a>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
