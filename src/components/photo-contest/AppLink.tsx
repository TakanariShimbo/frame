import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { appHref, navigate } from "../../lib/router";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };

// SPA内リンク。通常クリックは pushState 遷移、修飾キー付き・中クリックはブラウザに任せる。
export default function AppLink({ to, onClick, children, ...rest }: Props) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={appHref(to)} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
