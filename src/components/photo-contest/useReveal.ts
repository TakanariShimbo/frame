import { useEffect, type RefObject } from "react";
import { prefersReducedMotion } from "./useSectionNav";

// スクロールに応じた控えめなフェードイン。
// コンテナ内の [data-reveal] 要素へ .is-in を付けるだけで、動きはCSS側で定義する。
// prefers-reduced-motion 時は即座に表示する（情報は失わない）。
export function useReveal(containerRef: RefObject<HTMLElement | null>, ready: boolean) {
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !ready) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (els.length === 0) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { root, rootMargin: "0px 0px -6% 0px", threshold: 0.05 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [containerRef, ready]);
}
