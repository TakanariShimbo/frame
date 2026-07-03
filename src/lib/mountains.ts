// 山名検索。山岳データ（public/data/mountains.json、約27,000山）を
// 使い、名前・読み(カナ)・別名で部分一致検索する。正確な山頂座標と標高を持つのでオフライン可。
//   出典: 「山名一覧 on the Web地図」(map.jpn.org, あにねこ氏) ＋「日本の主な山岳標高一覧」（国土地理院）を加工。
//   ※ map.jpn.org 由来データの利用はあにねこ氏への許諾確認が前提（このブランチで並行確認中）。

type MountainRecord = {
  id: number;
  name: string;
  name_kana?: string;
  name_en?: string; // 機械生成ローマ字英名（例: Fujisan）。解説DBの title_en が無い山向け
  aliases?: { name: string; kana?: string }[]; // 別名（例: 蝦夷富士）。検索ヒット用
  latitude: number;
  longitude: number;
  elevation_m: number;
  prefecture?: string;
  priority: number;
};

export type MountainHit = {
  id: number;
  name: string;
  nameEn?: string;
  lat: number;
  lon: number;
  elevationM: number;
  prefecture?: string;
};

// 山の解説（事実ベースでAI生成）。id で引く。本体が重いのでARなどで遅延ロード。
export type MountainDescription = {
  title_ja: string; // 山名（日本語）
  title_en?: string; // 英名（例: Mt. Fuji）
  description_ja_long: string; // 日本語解説（長め）
  description_ja_short?: string; // 日本語解説（短め）
  description_en_long?: string; // 英語解説（長め）
  description_en_short?: string; // 英語解説（短め）
  tags_ja?: string[]; // タグ（日本語）
  tags_en?: string[]; // タグ（英語）
  quality?: "good" | "generic";
  url?: string; // 参考URL
};

let cache: MountainRecord[] | null = null;
let loading: Promise<MountainRecord[]> | null = null;

function load(): Promise<MountainRecord[]> {
  if (cache) return Promise.resolve(cache);
  if (loading) return loading;
  // base 配下に解決させる（GitHub Pages のプロジェクトページでも正しく引ける）。
  const url = `${import.meta.env.BASE_URL}data/mountains.json`;
  loading = fetch(url)
    .then((r) => (r.ok ? r.json() : []))
    .then((d: MountainRecord[]) => {
      cache = Array.isArray(d) ? d : [];
      return cache;
    })
    .catch(() => {
      loading = null;
      return [];
    });
  return loading;
}

// カタカナ→ひらがな（読み検索をカナ種別に依存させない）。
function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

// 解説DBはシャード分割（public/data/descriptions/shard-{n}.json、n = floor(id / SHARD_SIZE)）。
// 全27,000座を一括ロードすると20MB超になるため、選ばれた山のシャードだけ取得する。
const SHARD_SIZE = 500; // scripts/merge-descriptions.mjs と揃えること
const shardCache = new Map<number, Promise<Record<string, MountainDescription>>>();

function loadShard(n: number): Promise<Record<string, MountainDescription>> {
  const cached = shardCache.get(n);
  if (cached) return cached;
  const p = fetch(`${import.meta.env.BASE_URL}data/descriptions/shard-${n}.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => {
      shardCache.delete(n); // 失敗はキャッシュしない（再試行可能に）
      return {};
    });
  shardCache.set(n, p);
  return p;
}

/** 指定した山の解説（id→解説）を読み込む。必要なシャードだけ取得してキャッシュ。 */
export async function loadDescriptionsFor(ids: number[]): Promise<Map<number, MountainDescription>> {
  const shardNos = [...new Set(ids.map((id) => Math.floor(id / SHARD_SIZE)))];
  const shards = await Promise.all(shardNos.map(loadShard));
  const map = new Map<number, MountainDescription>();
  for (const shard of shards) {
    for (const id of ids) {
      const v = shard[String(id)];
      if (v?.description_ja_long) map.set(id, v);
    }
  }
  return map;
}

/** 名前・読みで部分一致。重要度(priority)→標高の順で並べ、上位 limit 件を返す。 */
export async function searchMountains(query: string, limit = 12): Promise<MountainHit[]> {
  const list = await load();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const qh = toHiragana(q);
  const hits = list.filter((m) => {
    if (m.name.toLowerCase().includes(q)) return true;
    if (m.name_kana && toHiragana(m.name_kana).includes(qh)) return true;
    return (m.aliases ?? []).some(
      (a) => a.name.toLowerCase().includes(q) || (a.kana ? toHiragana(a.kana).includes(qh) : false),
    );
  });
  hits.sort((a, b) => b.priority - a.priority || b.elevation_m - a.elevation_m);
  return hits.slice(0, limit).map((m) => ({
    id: m.id,
    name: m.name,
    nameEn: m.name_en,
    lat: m.latitude,
    lon: m.longitude,
    elevationM: m.elevation_m,
    prefecture: m.prefecture,
  }));
}
