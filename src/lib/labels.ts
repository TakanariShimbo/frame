// 写真に焼き込む山ラベル。元 trace では 3D 投影で山頂位置(dot)を求めていたが、
// frame では「山名を辞書から選ぶ」ので、位置は写真上に既定配置し、あとはドラッグで合わせる。
import type { MountainHit, MountainDescription } from "./mountains";

// 出力(仕上げ)で編集する山ラベル。座標は写真フレーム内の正規化値(0..1)。
export type ArLabel = {
  id: number;
  name: string;
  elevM: number;
  dotU: number;
  dotV: number;
  labelU: number;
  labelV: number;
  description?: string; // 解説（日本語・長め）
  descriptionShort?: string; // 解説（日本語・短め）
  descriptionEn?: string; // 解説（英語・長め）
  descriptionEnShort?: string; // 解説（英語・短め）
  nameEn?: string; // 英名（例: Mt. Fuji）
  labelAnchor?: "top" | "bottom" | "left" | "right"; // 引き出し線がラベルのどの辺から出るか（既定=下）
  prefecture?: string; // 所在県
  tagsJa?: string[]; // タグ（日本語）
  tagsEn?: string[]; // タグ（英語。tagsJa と同じ並び）
  source?: string; // 参考URL
};

// 選んだ山＋辞書解説から、写真に焼き込む編集用ラベル列を作る。
// 位置は写真上に横へ等間隔で並べた既定値（撮影内容に依らないので編集画面でドラッグ調整）。
export function buildLabels(
  mountains: MountainHit[],
  descMap: Map<number, MountainDescription>,
): ArLabel[] {
  const n = mountains.length;
  return mountains.map((m, i) => {
    const d = descMap.get(m.id);
    // 横方向に等間隔で配置（端に寄りすぎないよう 0.18〜0.82 に収める）。
    const t = n <= 1 ? 0.5 : 0.18 + (0.82 - 0.18) * (i / (n - 1));
    const dotV = 0.52;
    return {
      id: m.id,
      name: m.name,
      elevM: m.elevationM,
      dotU: t,
      dotV,
      labelU: t,
      labelV: Math.max(0.06, dotV - 0.16), // 名札は点の少し上を初期位置に
      description: d?.description_ja_long,
      descriptionShort: d?.description_ja_short,
      descriptionEn: d?.description_en_long,
      descriptionEnShort: d?.description_en_short,
      nameEn: d?.title_en,
      prefecture: m.prefecture,
      tagsJa: d?.tags_ja,
      tagsEn: d?.tags_en,
      source: d?.url,
    };
  });
}
