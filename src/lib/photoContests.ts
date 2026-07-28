// フォトコンテスト（YAMA FRAME AWARD）のコンテンツ読み込み。
// コンテンツはすべて public/data/photo-contests/*.json と public/images/photo-contests/ にあり、
// このモジュールは「取得・検証・整列」だけを行う。作品やSNSなどの固有情報をコードに書かないこと。

export type ContestImage = {
  src: string;
  mobileSrc?: string; // 無ければ src へフォールバック
  alt: string;
  position?: string; // object-position 相当（例 "center 45%"）
};

export type ContestSeo = {
  title?: string;
  description?: string;
  ogImage?: string;
};

export type ArchiveContest = {
  year: number;
  title: string;
  description: string;
  coverImage: ContestImage;
  isLatest: boolean;
  isPublished: boolean;
  order: number;
};

export type ArchiveContent = {
  heading: { eyebrow: string; title: string; description: string[] };
  seo?: ContestSeo;
  contests: ArchiveContest[]; // 公開分のみ・order 昇順
};

export type SocialLink = { label: string; url: string };

export type AwardWinner = {
  name: string;
  x?: SocialLink;
  instagram?: SocialLink;
};

export type Award = {
  id: string;
  order: number;
  number: string;
  prizeName: string;
  title: string;
  copy: string;
  description: string;
  image: ContestImage;
  winner: AwardWinner;
};

export type ContestResult = {
  year: number;
  title: string;
  description: string;
  concept: string[];
  outro?: string;
  isPublished: boolean;
  seo?: ContestSeo;
  awards: Award[]; // order 昇順
};

// JSON内のパス（"/images/..."）を Vite の base を考慮した実URLへ変換する。
export function assetUrl(path: string): string {
  return path.startsWith("/") ? import.meta.env.BASE_URL + path.slice(1) : path;
}

// ----------------------------------------------------------------------------
// 検証: 記述ミスでページ全体が黙って壊れないよう、原因が分かるメッセージで失敗させる。
// 依存を増やさないため手書き（Zod等は未導入）。
// ----------------------------------------------------------------------------

class ContentError extends Error {
  constructor(file: string, issues: string[]) {
    super(`photo-contest content error in ${file}:\n${issues.map((s) => `  - ${s}`).join("\n")}`);
    this.name = "ContentError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === "string");
}

function isValidUrl(v: unknown): boolean {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function checkImage(v: unknown, path: string, issues: string[]): void {
  if (!isRecord(v)) {
    issues.push(`${path} が設定されていません`);
    return;
  }
  if (!isNonEmptyString(v.src)) issues.push(`${path}.src（画像パス）が必要です`);
  if (!isNonEmptyString(v.alt)) issues.push(`${path}.alt（代替テキスト）が必要です`);
  if (v.mobileSrc !== undefined && !isNonEmptyString(v.mobileSrc)) issues.push(`${path}.mobileSrc が不正です`);
  if (v.position !== undefined && !isNonEmptyString(v.position)) issues.push(`${path}.position が不正です`);
}

function checkSocial(v: unknown, path: string, issues: string[]): void {
  if (v === undefined) return;
  if (!isRecord(v) || !isNonEmptyString(v.label)) issues.push(`${path}.label（表示名）が必要です`);
  if (!isRecord(v) || !isValidUrl(v.url)) issues.push(`${path}.url が有効なURLではありません`);
}

function checkOrders(items: { order?: unknown }[], path: string, issues: string[]): void {
  const seen = new Map<number, number>();
  items.forEach((it, i) => {
    if (typeof it.order !== "number" || !Number.isFinite(it.order)) {
      issues.push(`${path}[${i}].order は数値で指定してください`);
      return;
    }
    const prev = seen.get(it.order);
    if (prev !== undefined) issues.push(`${path}[${i}].order (${it.order}) が ${path}[${prev}] と重複しています`);
    seen.set(it.order, i);
  });
}

function validateArchive(json: unknown, file: string): ArchiveContent {
  const issues: string[] = [];
  if (!isRecord(json)) throw new ContentError(file, ["JSON全体がオブジェクトではありません"]);

  const heading = json.heading;
  if (!isRecord(heading)) {
    issues.push("heading が必要です");
  } else {
    if (!isNonEmptyString(heading.eyebrow)) issues.push("heading.eyebrow が必要です");
    if (!isNonEmptyString(heading.title)) issues.push("heading.title が必要です");
    if (!isStringArray(heading.description)) issues.push("heading.description は文字列の配列で指定してください");
  }

  const contests = json.contests;
  if (!Array.isArray(contests)) {
    issues.push("contests は配列で指定してください");
  } else {
    contests.forEach((c, i) => {
      const p = `contests[${i}]`;
      if (!isRecord(c)) {
        issues.push(`${p} がオブジェクトではありません`);
        return;
      }
      if (typeof c.year !== "number" || !Number.isInteger(c.year)) issues.push(`${p}.year は整数で指定してください`);
      if (!isNonEmptyString(c.title)) issues.push(`${p}.title が必要です`);
      if (!isNonEmptyString(c.description)) issues.push(`${p}.description が必要です`);
      checkImage(c.coverImage, `${p}.coverImage`, issues);
    });
    checkOrders(contests.filter(isRecord), "contests", issues);
  }

  if (issues.length > 0) throw new ContentError(file, issues);

  const all = (contests as ArchiveContest[]).map((c) => ({
    ...c,
    isLatest: c.isLatest === true,
    isPublished: c.isPublished === true,
  }));
  return {
    heading: heading as ArchiveContent["heading"],
    seo: isRecord(json.seo) ? (json.seo as ContestSeo) : undefined,
    contests: all.filter((c) => c.isPublished).sort((a, b) => a.order - b.order),
  };
}

function validateResult(json: unknown, file: string): ContestResult {
  const issues: string[] = [];
  if (!isRecord(json)) throw new ContentError(file, ["JSON全体がオブジェクトではありません"]);

  if (typeof json.year !== "number" || !Number.isInteger(json.year)) issues.push("year は整数で指定してください");
  if (!isNonEmptyString(json.title)) issues.push("title が必要です");
  if (!isNonEmptyString(json.description)) issues.push("description が必要です");
  if (!isStringArray(json.concept)) issues.push("concept は文字列の配列で指定してください");

  const awards = json.awards;
  if (!Array.isArray(awards) || awards.length === 0) {
    issues.push("awards は1件以上の配列で指定してください");
  } else {
    awards.forEach((a, i) => {
      const p = `awards[${i}]`;
      if (!isRecord(a)) {
        issues.push(`${p} がオブジェクトではありません`);
        return;
      }
      if (!isNonEmptyString(a.id)) issues.push(`${p}.id が必要です`);
      if (!isNonEmptyString(a.number)) issues.push(`${p}.number（作品番号）が必要です`);
      if (!isNonEmptyString(a.prizeName)) issues.push(`${p}.prizeName（賞名）が必要です`);
      if (!isNonEmptyString(a.title)) issues.push(`${p}.title が必要です`);
      if (a.copy !== undefined && typeof a.copy !== "string") issues.push(`${p}.copy が不正です`);
      if (!isNonEmptyString(a.description)) issues.push(`${p}.description が必要です`);
      checkImage(a.image, `${p}.image`, issues);
      if (!isRecord(a.winner) || !isNonEmptyString(a.winner.name)) {
        issues.push(`${p}.winner.name（受賞者名）が必要です`);
      } else {
        checkSocial(a.winner.x, `${p}.winner.x`, issues);
        checkSocial(a.winner.instagram, `${p}.winner.instagram`, issues);
      }
    });
    checkOrders(awards.filter(isRecord), "awards", issues);
  }

  if (issues.length > 0) throw new ContentError(file, issues);

  return {
    ...(json as unknown as ContestResult),
    isPublished: json.isPublished === true,
    awards: (awards as Award[]).slice().sort((a, b) => a.order - b.order),
  };
}

// ----------------------------------------------------------------------------
// 取得（結果はキャッシュ。存在しない年度は null）
// ----------------------------------------------------------------------------

let archiveCache: Promise<ArchiveContent> | null = null;

export function loadArchive(): Promise<ArchiveContent> {
  archiveCache ??= (async () => {
    const file = "data/photo-contests/archive.json";
    const res = await fetch(import.meta.env.BASE_URL + file);
    if (!res.ok) throw new Error(`failed to load ${file}: ${res.status}`);
    return validateArchive(await res.json(), file);
  })();
  return archiveCache;
}

const resultCache = new Map<number, Promise<ContestResult | null>>();

export function loadResult(year: number): Promise<ContestResult | null> {
  let p = resultCache.get(year);
  if (!p) {
    p = (async () => {
      if (!Number.isInteger(year) || year < 1900 || year > 2999) return null;
      const file = `data/photo-contests/${year}.json`;
      const res = await fetch(import.meta.env.BASE_URL + file);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`failed to load ${file}: ${res.status}`);
      // 開発サーバはSPAフォールバックで404でもHTMLを返すことがあるため、JSONとして読めなければ「無し」扱い。
      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return null;
      }
      const data = validateResult(json, file);
      return data.isPublished ? data : null;
    })();
    resultCache.set(year, p);
  }
  return p;
}
