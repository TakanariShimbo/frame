import { useEffect, useState } from "react";
import { loadArchive, assetUrl, type ArchiveContent } from "../../lib/photoContests";
import { prefersReducedMotion, useSectionNav } from "./useSectionNav";
import { useReveal } from "./useReveal";
import { useDocumentMeta } from "./useDocumentMeta";
import ContestSideNav from "./ContestSideNav";
import ArchiveMobileNav from "./ArchiveMobileNav";
import ArchiveItem from "./ArchiveItem";
import ContestNotFound from "./ContestNotFound";
import { IconCaret } from "../icons";

type State = { status: "loading" } | { status: "ready"; data: ArchiveContent } | { status: "error" };

// フォトコンテスト一覧ページ（/photo-contest）。
// 内容はすべて public/data/photo-contests/archive.json から読み込む。
export default function PhotoContestArchivePage() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    loadArchive()
      .then((data) => {
        if (alive) setState({ status: "ready", data });
      })
      .catch((err) => {
        console.error(err);
        if (alive) setState({ status: "error" });
      });
    return () => {
      alive = false;
    };
  }, []);

  const data = state.status === "ready" ? state.data : null;
  const contests = data?.contests ?? [];
  const { containerRef, setSectionRef, active, scrollTo } = useSectionNav(contests.length);
  useReveal(containerRef, state.status === "ready");
  useDocumentMeta(
    data
      ? {
          title: data.seo?.title ?? "PHOTO CONTEST ARCHIVE | YAMA FRAME AWARD",
          description: data.seo?.description,
          ogImage: data.seo?.ogImage ? window.location.origin + assetUrl(data.seo.ogImage) : undefined,
        }
      : null,
  );

  if (state.status === "error") return <ContestNotFound isError />;
  if (!data) return <div className="pc-screen" aria-busy="true" />;

  const navItems = contests.map((c, i) => ({ number: String(i + 1).padStart(2, "0"), label: `${c.yearLabel ?? c.year} ${c.title}` }));
  const scrollToTop = () => {
    containerRef.current?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  return (
    <div className="pc-screen pca" ref={containerRef}>
      <ContestSideNav
        variant="archive"
        ariaLabel="開催コンテストナビゲーション"
        items={navItems}
        activeIndex={active}
        onSelect={scrollTo}
        onLogoClick={scrollToTop}
      />
      <main className="pca-main">
        <header className="pca-header">
          <p className="pca-mlogo" aria-hidden>
            YAMA FRAME AWARD
          </p>
          <p className="kicker">{data.heading.eyebrow}</p>
          <h1 className="pca-heading">{data.heading.title}</h1>
          <p className="pca-lead">
            {data.heading.description.map((line, i) => (
              <span key={i} className="pca-lead-line">
                {line}
              </span>
            ))}
          </p>
        </header>
        <ArchiveMobileNav items={navItems} activeIndex={active} onSelect={scrollTo} />
        <div className="pca-list">
          {contests.map((c, i) => (
            <ArchiveItem key={c.year} contest={c} index={i} sectionRef={setSectionRef(i)} />
          ))}
        </div>
        {contests.length > 1 && (
          <p className="pca-scrollcue" aria-hidden>
            <IconCaret dir="down" size={16} className="pca-scrollcue-icon" />
            <span className="pca-scrollcue-text">SCROLL</span>
          </p>
        )}
      </main>
    </div>
  );
}
