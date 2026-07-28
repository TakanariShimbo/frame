import { useEffect, useState } from "react";
import { loadResult, assetUrl, type ContestResult } from "../../lib/photoContests";
import { navigate } from "../../lib/router";
import { useSectionNav } from "./useSectionNav";
import { useReveal } from "./useReveal";
import { useDocumentMeta } from "./useDocumentMeta";
import ContestSideNav from "./ContestSideNav";
import AwardSection from "./AwardSection";
import ContestNotFound from "./ContestNotFound";
import { IconCaret } from "../icons";

type State =
  | { status: "loading" }
  | { status: "ready"; data: ContestResult }
  | { status: "notfound" }
  | { status: "error" };

// 年度別フォトコンテスト結果ページ（/photo-contest/:year）。
// 全年度を1つの動的ルートで描画する。内容は public/data/photo-contests/<year>.json から読み込み、
// 存在しない・非公開の年度は404相当の表示にする。
export default function PhotoContestResultPage({ yearParam }: { yearParam: string }) {
  const year = /^\d{4}$/.test(yearParam) ? Number(yearParam) : NaN;
  // 年度が変わるときは Root 側の key で作り直されるため、不正な年度は初期状態で確定できる
  const [state, setState] = useState<State>(() => (Number.isFinite(year) ? { status: "loading" } : { status: "notfound" }));

  useEffect(() => {
    if (!Number.isFinite(year)) return;
    let alive = true;
    loadResult(year)
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
  }, [year]);

  const data = state.status === "ready" ? state.data : null;
  const awards = data?.awards ?? [];
  const { containerRef, setSectionRef, active, scrollTo } = useSectionNav(awards.length);
  useReveal(containerRef, state.status === "ready");
  useDocumentMeta(
    data
      ? {
          title: data.seo?.title ?? `${data.year} ${data.title} | YAMA FRAME AWARD`,
          description: data.seo?.description ?? data.description,
          ogImage: data.seo?.ogImage ? window.location.origin + assetUrl(data.seo.ogImage) : undefined,
        }
      : null,
  );

  if (state.status === "notfound") return <ContestNotFound />;
  if (state.status === "error") return <ContestNotFound isError />;
  if (!data) return <div className="pc-screen" aria-busy="true" />;

  const navItems = awards.map((a) => ({ number: a.number, label: a.title }));

  return (
    <div className="pc-screen pcr" ref={containerRef}>
      <h1 className="pc-vh">{`${data.year} ${data.title} 受賞作品`}</h1>
      <ContestSideNav
        variant="result"
        ariaLabel="受賞作品ナビゲーション"
        yearLabel={String(data.year)}
        items={navItems}
        activeIndex={active}
        onSelect={scrollTo}
        onLogoClick={() => navigate("/photo-contest")}
      />
      <main className="pcr-main">
        {awards.length > 0 && (
          <AwardSection
            award={awards[0]}
            index={0}
            concept={data.concept}
            contestDescription={data.description}
            sectionRef={setSectionRef(0)}
          />
        )}
        {awards.length > 1 && (
          <div className="pcr-grid">
            {awards.slice(1).map((a, i) => (
              <AwardSection key={a.id} award={a} index={i + 1} sectionRef={setSectionRef(i + 1)} />
            ))}
          </div>
        )}
        {data.outro && (
          <footer className="pcr-outro" data-reveal>
            <p className="pcr-outro-text">{data.outro}</p>
            <IconCaret dir="down" size={16} className="pcr-outro-icon" />
          </footer>
        )}
      </main>
    </div>
  );
}
