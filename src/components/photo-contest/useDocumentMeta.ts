import { useEffect } from "react";

type Meta = {
  title?: string;
  description?: string;
  ogImage?: string; // 絶対URL
  noindex?: boolean;
};

// SPAのため、タイトル・description・OGP相当のmetaをクライアント側で書き換える。
// フォトコンテストページを離れたら元のアプリのmetaへ戻す。
export function useDocumentMeta(meta: Meta | null) {
  const title = meta?.title;
  const description = meta?.description;
  const ogImage = meta?.ogImage;
  const noindex = meta?.noindex === true;
  const enabled = meta !== null;

  useEffect(() => {
    if (!enabled) return;
    const prevTitle = document.title;
    if (title) document.title = title;

    const restores: (() => void)[] = [];
    const setMeta = (attr: "name" | "property", key: string, content: string | undefined) => {
      if (!content) return;
      const found = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (found) {
        const prev = found.getAttribute("content") ?? "";
        found.setAttribute("content", content);
        restores.push(() => found.setAttribute("content", prev));
      } else {
        const el = document.createElement("meta");
        el.setAttribute(attr, key);
        el.setAttribute("content", content);
        document.head.appendChild(el);
        restores.push(() => el.remove());
      }
    };

    setMeta("name", "description", description);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:image", ogImage);
    if (noindex) setMeta("name", "robots", "noindex");

    return () => {
      document.title = prevTitle;
      restores.forEach((f) => f());
    };
  }, [enabled, title, description, ogImage, noindex]);
}
