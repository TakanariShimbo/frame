import { useCallback, useEffect, useRef, useState } from "react";

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ページ内セクションの「現在地」管理。
// このアプリの画面は window ではなく fixed なコンテナ（.pc-screen）がスクロールするため、
// コンテナ基準で判定する。短いセクションが末尾にあると IntersectionObserver の帯判定では
// 最後の項目がアクティブにならないことがあるので、scroll + rAF で決定的に計算する。
export function useSectionNav(count: number) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sectionsRef = useRef<(HTMLElement | null)[]>([]);
  // ナビ操作直後は、スクロールが落ち着くまで自動判定を保留してタップした番号を維持する
  // （目的地が最下部付近だと十分にスクロールできず、別の番号へ切り替わってしまうため）
  const lockRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState(0);

  const setSectionRef = useCallback(
    (i: number) => (el: HTMLElement | null) => {
      sectionsRef.current[i] = el;
    },
    [],
  );

  useEffect(() => {
    const root = containerRef.current;
    if (!root || count === 0) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const rootTop = root.getBoundingClientRect().top;
      // 画面上端から40%の線を「読んでいる位置」とみなし、それを越えた最後のセクションを現在地にする。
      // 一覧スマホのようにセクションが低い場合に2つ同時に線を越えないよう、上限を設ける。
      const focus = Math.min(root.clientHeight * 0.4, 176);
      let idx = 0;
      for (let i = 0; i < count; i++) {
        const el = sectionsRef.current[i];
        if (el && el.getBoundingClientRect().top - rootTop <= focus) idx = i;
      }
      // 最下部までスクロールしたら（最後のセクションが短くても）末尾を現在地にする
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) idx = count - 1;
      setActive(idx);
    };
    const onScroll = () => {
      if (lockRef.current !== null) {
        // プログラムによるスクロール中: 収まってから判定を解禁する
        clearTimeout(lockRef.current);
        lockRef.current = setTimeout(() => {
          lockRef.current = null;
        }, 200);
        return;
      }
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [count]);

  const scrollTo = useCallback((i: number) => {
    const el = sectionsRef.current[i];
    if (!el) return;
    setActive(i);
    if (lockRef.current) clearTimeout(lockRef.current);
    lockRef.current = setTimeout(() => {
      lockRef.current = null;
    }, 400);
    el.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }, []);

  return { containerRef, setSectionRef, active, scrollTo };
}
