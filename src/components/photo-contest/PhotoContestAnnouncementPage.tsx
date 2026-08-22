import { useEffect, useMemo, useState } from "react";
import { loadAnnouncement, resolveStatus, assetUrl, type AnnouncementContent } from "../../lib/photoContests";
import { useSectionNav } from "./useSectionNav";
import { useReveal } from "./useReveal";
import { useDocumentMeta } from "./useDocumentMeta";
import ContestPicture from "./ContestPicture";
import AnnouncementSideNav from "./AnnouncementSideNav";
import AnnouncementMobileNav from "./AnnouncementMobileNav";
import PlatformLinks from "./PlatformLinks";
import MentionAccounts from "./MentionAccounts";
import SectionHead from "./SectionHead";
import SponsorList from "./SponsorList";
import PrizeList from "./PrizeList";
import ContestNotFound from "./ContestNotFound";

type State =
  | { status: "loading" }
  | { status: "ready"; data: AnnouncementContent }
  | { status: "notfound" }
  | { status: "error" };

// 日時（ISO）を指定タイムゾーンの「YYYY.MM.DD」で表示する。閲覧者のTZに依らず日本時間で見せる。
function formatDate(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}.${get("month")}.${get("day")}`;
}

// 開催告知ページ（/photo-contest/<id>/announcement）。
// 開催前〜結果公開後まで同じURL・同じレイアウトで、状態に応じて表示だけ切り替える。
// 内容はすべて public/data/photo-contests/announcements/<id>.json から読み込む。
export default function PhotoContestAnnouncementPage({ contestId }: { contestId: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    loadAnnouncement(contestId)
      .then((data) => {
        if (alive) setState(data ? { status: "ready", data } : { status: "notfound" });
      })
      .catch((err) => {
        console.error(err);
        if (alive) setState({ status: "error" });
      });
    return () => {
      alive = false;
    };
  }, [contestId]);

  const data = state.status === "ready" ? state.data : null;

  // 表示するセクション（協賛・景品は無ければ出さない）。番号はこの並びから動的生成。
  const { sections, sponsorsIndex, prizesIndex } = useMemo(() => {
    const base = ["メインビジュアル", "テーマ", "開催期間", "応募条件", "応募プラットフォーム"];
    let sponsorsIndex = -1;
    let prizesIndex = -1;
    if (data && data.sponsors.length > 0) {
      sponsorsIndex = base.length;
      base.push("協賛ブランド");
    }
    if (data && data.prizes.items.length > 0) {
      prizesIndex = base.length;
      base.push(data.prizes.title);
    }
    return { sections: base, sponsorsIndex, prizesIndex };
  }, [data]);

  const { containerRef, setSectionRef, active, scrollTo } = useSectionNav(sections.length);
  useReveal(containerRef, state.status === "ready");
  useDocumentMeta(
    data
      ? {
          title: data.seo?.title ?? `ヤマフレームフォトコンテスト ${data.hero.yearLabel} 開催のお知らせ | YAMA FRAME`,
          description: data.seo?.description ?? data.hero.description,
          ogImage: data.seo?.ogImage ? window.location.origin + assetUrl(data.seo.ogImage) : undefined,
        }
      : null,
  );

  if (state.status === "notfound") return <ContestNotFound />;
  if (state.status === "error") return <ContestNotFound isError />;
  if (!data) return <div className="pc-screen" aria-busy="true" />;

  const { hero, theme, application: app, status } = data;
  const currentStatus = resolveStatus(status);
  const statusLabel = data.statusLabels[currentStatus];
  const start = formatDate(status.startAt, status.timeZone);
  const end = formatDate(status.endAt, status.timeZone);
  const navItems = sections.map((label, i) => ({ number: String(i + 1).padStart(2, "0"), label }));

  return (
    <div className="pc-screen pcan" ref={containerRef}>
      <AnnouncementSideNav eyebrow={hero.eyebrow} yearLabel={hero.yearLabel} />
      <AnnouncementMobileNav items={navItems} activeIndex={active} onSelect={scrollTo} />

      <header className="pcan-mheader">
        <span className="pcan-mlogo">YAMA FRAME AWARD</span>
      </header>

      <main className="pcan-main">
        {/* 01 メインビジュアル */}
        <section className="pcan-hero" ref={setSectionRef(0)} aria-labelledby="pcan-h1">
          <div className="pcan-hero-media">
            <ContestPicture image={hero.image} priority />
            <span className="pcan-hero-shade" aria-hidden />
          </div>
          <div className="pcan-hero-copy" data-reveal>
            <p className="pcan-eyebrow">{hero.eyebrow}</p>
            <h1 className="pcan-hero-title" id="pcan-h1">
              {hero.titleLines.map((line, i) => (
                <span key={i} className="pcan-hero-title-line">
                  {line}
                </span>
              ))}
              <span className="pcan-hero-year">{hero.yearLabel}</span>
            </h1>
            <span className="pcan-goldline" aria-hidden />
            <p className="pcan-hero-lead">{hero.lead}</p>
            {hero.description && <p className="pcan-hero-desc">{hero.description}</p>}
            {statusLabel && (
              <p className="pcan-hero-status">
                <span className="pcan-status-dot" aria-hidden />
                {statusLabel}
              </p>
            )}
          </div>
        </section>

        {/* テーマ / 開催期間 / 応募条件 / 応募プラットフォーム（1つの枠を罫線で2×2に分割） */}
        <div className="pcan-infobox" data-reveal>
          <section className="pcan-infocell" ref={setSectionRef(1)}>
            <p className="pcan-sec-label">テーマ</p>
            <h2 className="pcan-theme-title">{theme.title}</h2>
            <p className="pcan-theme-desc">{theme.description}</p>
          </section>

          <section className="pcan-infocell" ref={setSectionRef(2)}>
            <p className="pcan-sec-label">開催期間</p>
            <p className="pcan-period-date">
              {start}
              <span className="pcan-period-dash" aria-hidden>
                {" — "}
              </span>
              {end}
            </p>
            {data.periodNote && <p className="pcan-period-note">{data.periodNote}</p>}
          </section>

          <section className="pcan-infocell" ref={setSectionRef(3)}>
            <p className="pcan-sec-label">応募条件</p>
            <ul className="pcan-req">
              {app.requirements.map((r, i) => (
                <li key={i} className="pcan-req-item">
                  <span className="pcan-req-mark" aria-hidden />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="pcan-infocell" ref={setSectionRef(4)}>
            <p className="pcan-sec-label">応募プラットフォーム</p>
            <PlatformLinks platforms={app.platforms} />
            <MentionAccounts accounts={app.mentionAccounts} pendingMessage={app.pendingAccountMessage} />
          </section>
        </div>

        {/* 協賛ブランド */}
        {data.sponsors.length > 0 && (
          <section className="pcan-sponsors-sec" ref={setSectionRef(sponsorsIndex)} data-reveal aria-labelledby="pcan-sponsors-heading">
            <SectionHead eyebrow="SPONSORS" title="協賛ブランド" titleId="pcan-sponsors-heading" />
            <SponsorList sponsors={data.sponsors} />
          </section>
        )}

        {/* 景品 */}
        {data.prizes.items.length > 0 && (
          <section className="pcan-prizes-sec" ref={setSectionRef(prizesIndex)} data-reveal aria-labelledby="pcan-prizes-heading">
            <SectionHead eyebrow={data.prizes.eyebrow} title={data.prizes.title} titleId="pcan-prizes-heading" />
            <PrizeList prizes={data.prizes.items} sourceLinkLabel={data.prizes.sourceLinkLabel} />
          </section>
        )}

        <footer className="pcan-footer" aria-hidden>
          YAMA FRAME AWARD {hero.yearLabel}
        </footer>
      </main>
    </div>
  );
}
