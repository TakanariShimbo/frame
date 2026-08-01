// 写真に焼き込む山ラベル。元 trace では 3D 投影で山頂位置(dot)を求めていたが、
// frame では「山名を辞書から選ぶ」ので、位置は写真上に既定配置し、あとはドラッグで合わせる。
import type { MountainDescription } from "./mountains";

// 山選びで確定した1件。辞書ヒットのほか、自由入力（山小屋・池・地名・通称など）も
// 同じ形で扱う。自由入力は id が負・elevationM 任意・custom=true で、辞書解説は付かない
// （解説は Studio の編集機能でユーザーが書ける）。
export type PickedPlace = {
  id: number;
  name: string;
  nameEn?: string;
  elevationM?: number;
  prefecture?: string;
  custom?: boolean;
};

// 出力(仕上げ)で編集する山ラベル。座標は写真フレーム内の正規化値(0..1)。
export type ArLabel = {
  id: number;
  name: string;
  elevM?: number; // 標高。自由入力（山小屋・池・地名など）では未設定になり、標高表示は全箇所で自動非表示
  dotU: number;
  dotV: number;
  labelU: number;
  // 名札の折り返し幅（写真幅に対する比率）。未設定なら折り返さない（1行）。
  labelW?: number;
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
  hidden?: boolean; // 写真上に名札・引き出し線を描かない（解説・題字の題材候補には残る）
};

// 山名は編集で任意の位置に改行(\n)を入れられる。改行を反映するのは写真上の名札のみで、
// タイトル・解説見出し・一覧表示など1行前提の箇所は oneLineName で1行に畳んで使う。

// 改行入りの山名を行の配列にする（空行と行頭行末の空白は除く）。
export function nameLines(name: string): string[] {
  return name
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// 改行入りの山名を1行にする。英数字同士の境目は空白で繋ぎ（"Mount\nFuji"→"Mount Fuji"）、
// 和文はそのまま詰める（"雲取\n山"→"雲取山"）。
export function oneLineName(name: string): string {
  const lines = nameLines(name);
  if (lines.length === 0) return "";
  return lines.reduce((acc, line) => {
    const glue = /[\x21-\x7e]$/.test(acc) && /^[\x21-\x7e]/.test(line) ? " " : "";
    return acc + glue + line;
  });
}

// 選んだ山＋辞書解説から、写真に焼き込む編集用ラベル列を作る。
// 位置は写真上に横へ等間隔で並べた既定値（撮影内容に依らないので編集画面でドラッグ調整）。
export function buildLabels(
  mountains: PickedPlace[],
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
      nameEn: d?.title_en ?? m.nameEn, // 解説DBの英名を優先、無ければ機械生成ローマ字
      prefecture: m.prefecture,
      tagsJa: d?.tags_ja,
      tagsEn: d?.tags_en,
      source: d?.url,
    };
  });
}
