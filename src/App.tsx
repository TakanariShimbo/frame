import { useCallback, useState } from "react";
import Picker from "./components/Picker";
import Studio from "./components/Studio";
import type { ArLabel } from "./lib/labels";

// frame の画面は2つだけ:
//   pick   … 山名を選び、写真をのせる（入口）
//   studio … テンプレートを選び、文字・解説を仕上げて書き出す
// 元 trace の「山を写す(AR)」から 3D マップ・撮影地点・向き合わせを取り除き、
// 「山名を選ぶ → 写真をのせる → 仕上げる」に絞ったもの。
type Session = { photoUrl: string; labels: ArLabel[] };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);

  const onStart = useCallback((photoUrl: string, labels: ArLabel[]) => {
    setSession({ photoUrl, labels });
  }, []);

  const onBack = useCallback(() => {
    setSession((s) => {
      if (s) URL.revokeObjectURL(s.photoUrl); // 入口へ戻る時に写真URLを解放
      return null;
    });
  }, []);

  return session ? (
    <Studio photoUrl={session.photoUrl} initialLabels={session.labels} onBack={onBack} />
  ) : (
    <Picker onStart={onStart} />
  );
}
