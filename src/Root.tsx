import { useEffect, useState } from "react";
import App from "./App";
import { appPath } from "./lib/router";
import PhotoContestArchivePage from "./components/photo-contest/PhotoContestArchivePage";
import PhotoContestResultPage from "./components/photo-contest/PhotoContestResultPage";
import PhotoContestAnnouncementPage from "./components/photo-contest/PhotoContestAnnouncementPage";
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
  // 開催告知: /photo-contest/<id>/announcement（id は "2026-01" のような開催識別子。同年複数回に対応）
  const announcement = path.match(/^\/photo-contest\/([^/]+)\/announcement$/);
  if (announcement) return <PhotoContestAnnouncementPage key={announcement[1]} contestId={announcement[1]} />;
  // 年度別結果: /photo-contest/<year>（既存）
  const year = path.match(/^\/photo-contest\/([^/]+)$/);
  if (year) return <PhotoContestResultPage key={year[1]} yearParam={year[1]} />;
  if (path.startsWith("/photo-contest/")) return <ContestNotFound />;
  return <App />;
}
