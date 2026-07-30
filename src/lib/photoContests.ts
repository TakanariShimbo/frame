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
  // 導線を .tsx へ直書きしないためのデータ側指定。省略時は結果ページ（/photo-contest/<year>）へ。
  // 開催状態に応じて告知ページ等へ向ける（例 { href: "/photo-contest/2026-01/announcement", cta: "開催概要を見る" }）。
  link?: { href: string; cta: string };
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

// ----------------------------------------------------------------------------
// 開催告知ページ（/photo-contest/<id>/announcement）のコンテンツ型。
// 状態（scheduled/open/closed/resultsPublished）はデータの日時から算出し、
// 手動固定もできる。SNS・協賛URLは未確定なら null のまま（偽リンクを作らない）。
// ----------------------------------------------------------------------------

export type ContestStatus = "scheduled" | "open" | "closed" | "resultsPublished";

export type AnnouncementStatusConfig = {
  mode: "auto" | "manual";
  override: ContestStatus | null;
  timeZone: string;
  startAt: string; // ISO8601（例 2026-08-08T00:00:00+09:00）
  endAt: string; // ISO8601
  resultsPublished: boolean;
};

export type PlatformKey = "x" | "instagram" | "threads";

// メンション先の指定アカウント。label は表示名（例 "@r_outdoor_photo"）。
// url 未確定なら null（リンクにせず表示名だけ）。アカウント自体が未確定なら値ごと null。
export type MentionAccount = { label: string; url?: string | null };

export type SponsorLinkType = "instagram" | "official" | "x" | "none";

export type Sponsor = {
  name: string;
  logo?: string | null;
  linkType: SponsorLinkType;
  linkLabel: string;
  url?: string | null; // null ＝ リンクにしない（プレーン表示）
  order: number;
  isPublished: boolean;
};

export type AnnouncementContent = {
  id: string;
  slug: string;
  year: number;
  edition: number;
  isPublished: boolean;
  status: AnnouncementStatusConfig;
  statusLabels: Record<ContestStatus, string>;
  periodNote?: string;
  routes: { announcement: string; results?: string | null };
  hero: {
    eyebrow: string;
    titleLines: string[];
    yearLabel: string;
    lead: string;
    description: string;
    image: ContestImage;
  };
  theme: { title: string; description: string };
  application: {
    hashtag: string;
    mentionAccounts: Record<PlatformKey, MentionAccount | null>;
    pendingAccountMessage: string;
    platforms: PlatformKey[];
    requirements: string[];
    steps?: string[];
  };
  sponsors: Sponsor[]; // 公開分のみ・order 昇順
  seo?: ContestSeo;
};

// 現在の開催状態を算出する。manual なら override をそのまま返す。
// auto は「結果公開済み → 期間で scheduled/open/closed」の順で判定（日時は各ISO値のTZで比較）。
export function resolveStatus(cfg: AnnouncementStatusConfig, now: Date = new Date()): ContestStatus {
  if (cfg.mode === "manual" && cfg.override) return cfg.override;
  if (cfg.resultsPublished) return "resultsPublished";
  const start = new Date(cfg.startAt).getTime();
  const end = new Date(cfg.endAt).getTime();
  const t = now.getTime();
  if (Number.isFinite(start) && t < start) return "scheduled";
  if (Number.isFinite(end) && t > end) return "closed";
  return "open";
}

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

// ----------------------------------------------------------------------------
// 開催告知（/photo-contest/<id>/announcement）
// ----------------------------------------------------------------------------

const PLATFORM_KEYS: PlatformKey[] = ["x", "instagram", "threads"];
const SPONSOR_LINK_TYPES: SponsorLinkType[] = ["instagram", "official", "x", "none"];
const STATUS_KEYS: ContestStatus[] = ["scheduled", "open", "closed", "resultsPublished"];

function isValidDate(v: unknown): boolean {
  return typeof v === "string" && Number.isFinite(new Date(v).getTime());
}

function validateAnnouncement(json: unknown, file: string): AnnouncementContent {
  const issues: string[] = [];
  if (!isRecord(json)) throw new ContentError(file, ["JSON全体がオブジェクトではありません"]);

  if (!isNonEmptyString(json.id)) issues.push("id が必要です");
  if (!isNonEmptyString(json.slug)) issues.push("slug が必要です");
  if (typeof json.year !== "number" || !Number.isInteger(json.year)) issues.push("year は整数で指定してください");
  if (typeof json.edition !== "number" || !Number.isInteger(json.edition)) issues.push("edition は整数で指定してください");

  const status = json.status;
  if (!isRecord(status)) {
    issues.push("status が必要です");
  } else {
    if (status.mode !== "auto" && status.mode !== "manual") issues.push('status.mode は "auto" または "manual" です');
    if (status.override !== null && !(typeof status.override === "string" && STATUS_KEYS.includes(status.override as ContestStatus)))
      issues.push(`status.override は null か ${STATUS_KEYS.join("/")} のいずれかです`);
    if (!isValidDate(status.startAt)) issues.push("status.startAt が有効な日時ではありません");
    if (!isValidDate(status.endAt)) issues.push("status.endAt が有効な日時ではありません");
    if (isValidDate(status.startAt) && isValidDate(status.endAt) && new Date(status.endAt as string) <= new Date(status.startAt as string))
      issues.push("status.endAt は status.startAt より後にしてください");
  }

  const statusLabels = json.statusLabels;
  if (!isRecord(statusLabels)) {
    issues.push("statusLabels が必要です");
  } else {
    for (const k of STATUS_KEYS) if (!isNonEmptyString(statusLabels[k])) issues.push(`statusLabels.${k} が必要です`);
  }

  const routes = json.routes;
  if (!isRecord(routes) || !isNonEmptyString(routes.announcement)) issues.push("routes.announcement（告知ページのパス）が必要です");

  const hero = json.hero;
  if (!isRecord(hero)) {
    issues.push("hero が必要です");
  } else {
    if (!isNonEmptyString(hero.eyebrow)) issues.push("hero.eyebrow が必要です");
    if (!isStringArray(hero.titleLines) || (hero.titleLines as string[]).length === 0) issues.push("hero.titleLines は文字列の配列で指定してください");
    if (!isNonEmptyString(hero.yearLabel)) issues.push("hero.yearLabel が必要です");
    if (!isNonEmptyString(hero.lead)) issues.push("hero.lead が必要です");
    checkImage(hero.image, "hero.image", issues);
  }

  const theme = json.theme;
  if (!isRecord(theme) || !isNonEmptyString(theme.title)) issues.push("theme.title が必要です");
  if (!isRecord(theme) || !isNonEmptyString(theme.description)) issues.push("theme.description が必要です");

  const app = json.application;
  if (!isRecord(app)) {
    issues.push("application が必要です");
  } else {
    if (!isNonEmptyString(app.hashtag)) issues.push("application.hashtag が必要です");
    if (!isNonEmptyString(app.pendingAccountMessage)) issues.push("application.pendingAccountMessage が必要です");
    if (!Array.isArray(app.platforms) || (app.platforms as unknown[]).some((p) => !PLATFORM_KEYS.includes(p as PlatformKey)))
      issues.push(`application.platforms は ${PLATFORM_KEYS.join("/")} の配列で指定してください`);
    if (!isStringArray(app.requirements) || (app.requirements as string[]).length === 0) issues.push("application.requirements は文字列の配列で指定してください");
    if (app.steps !== undefined && !isStringArray(app.steps)) issues.push("application.steps は文字列の配列で指定してください（省略可）");
    if (!isRecord(app.mentionAccounts)) {
      issues.push("application.mentionAccounts が必要です");
    } else {
      for (const k of PLATFORM_KEYS) {
        const v = (app.mentionAccounts as Record<string, unknown>)[k];
        if (v === null || v === undefined) continue;
        if (!isRecord(v) || !isNonEmptyString(v.label)) {
          issues.push(`application.mentionAccounts.${k}.label（表示名）が必要です（未確定なら null）`);
          continue;
        }
        if (v.url !== null && v.url !== undefined && !isValidUrl(v.url)) issues.push(`application.mentionAccounts.${k}.url が有効なURLではありません（未確定なら null）`);
      }
    }
  }

  const sponsors = json.sponsors;
  if (!Array.isArray(sponsors)) {
    issues.push("sponsors は配列で指定してください");
  } else {
    sponsors.forEach((s, i) => {
      const p = `sponsors[${i}]`;
      if (!isRecord(s)) {
        issues.push(`${p} がオブジェクトではありません`);
        return;
      }
      if (!isNonEmptyString(s.name)) issues.push(`${p}.name が必要です`);
      if (!isNonEmptyString(s.linkLabel)) issues.push(`${p}.linkLabel が必要です`);
      if (typeof s.linkType !== "string" || !SPONSOR_LINK_TYPES.includes(s.linkType as SponsorLinkType))
        issues.push(`${p}.linkType は ${SPONSOR_LINK_TYPES.join("/")} のいずれかです`);
      if (s.url !== null && s.url !== undefined && !isValidUrl(s.url)) issues.push(`${p}.url が有効なURLではありません（未確定なら null）`);
    });
    checkOrders(sponsors.filter(isRecord), "sponsors", issues);
  }

  if (issues.length > 0) throw new ContentError(file, issues);

  const data = json as unknown as AnnouncementContent;
  return {
    ...data,
    isPublished: json.isPublished === true,
    sponsors: (sponsors as Sponsor[]).filter((s) => s.isPublished === true).sort((a, b) => a.order - b.order),
  };
}

const announcementCache = new Map<string, Promise<AnnouncementContent | null>>();

// 告知コンテンツを id（例 "2026-01"）で取得。存在しない・非公開は null。
export function loadAnnouncement(id: string): Promise<AnnouncementContent | null> {
  let p = announcementCache.get(id);
  if (!p) {
    p = (async () => {
      if (!/^[A-Za-z0-9-]+$/.test(id)) return null;
      const file = `data/photo-contests/announcements/${id}.json`;
      const res = await fetch(import.meta.env.BASE_URL + file);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`failed to load ${file}: ${res.status}`);
      // 開発サーバはSPAフォールバックで404でもHTMLを返すため、JSONとして読めなければ「無し」扱い。
      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return null;
      }
      const data = validateAnnouncement(json, file);
      return data.isPublished ? data : null;
    })();
    announcementCache.set(id, p);
  }
  return p;
}
