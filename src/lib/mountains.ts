// 山名検索。隣プロジェクト由来の山岳データ（public/data/mountains.json、約1,061山）を
// 使い、名前・読み(カナ)で部分一致検索する。正確な山頂座標と標高を持つのでオフライン可。
//   出典: 「日本の主な山岳標高一覧」（国土地理院）を加工。

type MountainRecord = {
  id: number;
  name: string;
  name_kana?: string;
  latitude: number;
  longitude: number;
  elevation_m: number;
  prefecture?: string;
  priority: number;
};

export type MountainHit = {
  id: number;
  name: string;
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
let descCache: Map<number, MountainDescription> | null = null;
let descLoading: Promise<Map<number, MountainDescription>> | null = null;

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

/** 全山頂を返す（山頂マーカー用）。データは一度ロードしてキャッシュ。 */
export async function loadAllMountains(): Promise<MountainHit[]> {
  const list = await load();
  return list.map((m) => ({
    id: m.id,
    name: m.name,
    lat: m.latitude,
    lon: m.longitude,
    elevationM: m.elevation_m,
    prefecture: m.prefecture,
  }));
}

/** 山の解説（id→解説）を読み込む。本体が重いので必要時（写真ARなど）に遅延ロードしてキャッシュ。 */
export async function loadMountainDescriptions(): Promise<Map<number, MountainDescription>> {
  if (descCache) return descCache;
  if (descLoading) return descLoading;
  const url = `${import.meta.env.BASE_URL}data/mountain_descriptions.json`;
  descLoading = fetch(url)
    .then((r) => (r.ok ? r.json() : { descriptions: {} }))
    .then((d: { descriptions?: Record<string, MountainDescription> }) => {
      const map = new Map<number, MountainDescription>();
      for (const [id, v] of Object.entries(d.descriptions ?? {})) {
        if (v?.description_ja_long) map.set(Number(id), v);
      }
      descCache = map;
      return map;
    })
    .catch(() => {
      descLoading = null;
      return new Map<number, MountainDescription>();
    });
  return descLoading;
}

// 図鑑のエントリ。山岳データ＋解説を id でマージした一覧表示用レコード。
export type ZukanEntry = {
  id: number;
  name: string;
  kana?: string; // 読み（ひらがな化済み。五十音ソート・検索用）
  lat: number;
  lon: number;
  elevationM: number;
  prefecture?: string;
  priority: number; // 有名順ソート用
  titleEn?: string; // 英名（例: Mt. Fuji）
  descriptionJa?: string; // 解説（長め）
  descriptionShortJa?: string; // 解説（短め。カード用）
  descriptionEn?: string; // 英語解説（長め。詳細ページで日本語の下に出す）
  tags: string[]; // タグ（日本語）
  url?: string; // 参考URL
};

/** 図鑑用: 全山岳＋解説をマージして返す（どちらも一度ロードすればキャッシュ）。 */
export async function loadZukanEntries(): Promise<ZukanEntry[]> {
  const [list, descs] = await Promise.all([load(), loadMountainDescriptions()]);
  return list.map((m) => {
    const d = descs.get(m.id);
    return {
      id: m.id,
      name: m.name,
      kana: m.name_kana ? toHiragana(m.name_kana) : undefined,
      lat: m.latitude,
      lon: m.longitude,
      elevationM: m.elevation_m,
      prefecture: m.prefecture,
      priority: m.priority,
      titleEn: d?.title_en,
      descriptionJa: d?.description_ja_long,
      descriptionShortJa: d?.description_ja_short,
      descriptionEn: d?.description_en_long,
      tags: d?.tags_ja ?? [],
      url: d?.url,
    };
  });
}

/** 名前・読みで部分一致。重要度(priority)→標高の順で並べ、上位 limit 件を返す。 */
export async function searchMountains(query: string, limit = 12): Promise<MountainHit[]> {
  const list = await load();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const qh = toHiragana(q);
  const hits = list.filter((m) => {
    if (m.name.toLowerCase().includes(q)) return true;
    return m.name_kana ? toHiragana(m.name_kana).includes(qh) : false;
  });
  hits.sort((a, b) => b.priority - a.priority || b.elevation_m - a.elevation_m);
  return hits.slice(0, limit).map((m) => ({
    id: m.id,
    name: m.name,
    lat: m.latitude,
    lon: m.longitude,
    elevationM: m.elevation_m,
    prefecture: m.prefecture,
  }));
}
