import { assetUrl, type ContestImage } from "../../lib/photoContests";

type Props = {
  image: ContestImage;
  className?: string;
  // ファーストビューの主要画像だけ eager + fetchPriority=high にする
  priority?: boolean;
};

// コンテンツJSONの image 定義（src / mobileSrc / alt / position）を描画する。
// mobileSrc が無ければ src がそのまま使われる（<source> を出さないだけ）。
export default function ContestPicture({ image, className, priority = false }: Props) {
  return (
    <picture className={className}>
      {image.mobileSrc && <source media="(max-width: 720px)" srcSet={assetUrl(image.mobileSrc)} />}
      <img
        src={assetUrl(image.src)}
        alt={image.alt}
        style={image.position ? { objectPosition: image.position } : undefined}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
      />
    </picture>
  );
}
