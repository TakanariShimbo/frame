import { useEffect, useState } from "react";
import App from "./App";
import { appPath } from "./lib/router";
import PhotoContestArchivePage from "./components/photo-contest/PhotoContestArchivePage";
import PhotoContestResultPage from "./components/photo-contest/PhotoContestResultPage";
import ContestNotFound from "./components/photo-contest/ContestNotFound";

// URLの最小ルーティング。/photo-contest 配下だけをURLで分岐し、それ以外は従来のアプリ。
// （既存アプリ自体は state ベースの画面切り替えのままで、URLは "/" を使い続ける）
export default function Root() {
  const [path, setPath] = useState(appPath);
  useEffect(() => {
    const onPop = () => setPath(appPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (path === "/photo-contest") return <PhotoContestArchivePage />;
  const year = path.match(/^\/photo-contest\/([^/]+)$/);
  if (year) return <PhotoContestResultPage key={year[1]} yearParam={year[1]} />;
  if (path.startsWith("/photo-contest/")) return <ContestNotFound />;
  return <App />;
}
