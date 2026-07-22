import { useCallback, useRef, useState } from "react";
import Picker from "./components/Picker";
import MountainPicker from "./components/MountainPicker";
import Board from "./components/Board";
import Studio, { type StudioSnapshot } from "./components/Studio";
import type { ArLabel } from "./lib/labels";
import type { PickedMedia } from "./lib/video";

// frame のフロー（一覧をハブにした自由な進行）:
//   home     … 写真を選ぶ（複数可）→ 1枚目の山選びへ
//   board    … 写真一覧。好きな写真から仕上げ・再編集。まとめて保存もここ
//   mountain … 写真1枚ぶんの山選び
//   studio   … テーマを選び、文字・解説を仕上げて書き出す（編集状態は item に保存）
export type WorkItem = {
  id: number;
  photoUrl: string; // 編集に使う静止画（動画の場合は先頭フレームのポスター）
  videoUrl: string | null; // 動画入力ならその動画URL（書き出しは全フレームへ同じ内容を焼き込む）
  labels: ArLabel[] | null; // 山選び済みなら non-null
  snapshot: StudioSnapshot | null; // 仕上げ画面の編集状態（再編集で復元）
  exportBlob: Blob | null; // 最後に書き出した成果物。画像はJPEG、動画は mp4/webm（まとめて保存に使う）
};

type View = { kind: "home" } | { kind: "board" } | { kind: "mountain"; id: number } | { kind: "studio"; id: number };

export default function App() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [view, setView] = useState<View>({ kind: "home" });
  const nextId = useRef(1);

  const makeItems = useCallback((media: PickedMedia[]): WorkItem[] => {
    return media.map((m) => ({ id: nextId.current++, photoUrl: m.photoUrl, videoUrl: m.videoUrl, labels: null, snapshot: null, exportBlob: null }));
  }, []);

  // ホームで写真を選んだら、1枚目の山選びへ直行（一覧はいつでも戻れるハブ）。
  const onPick = useCallback(
    (media: PickedMedia[]) => {
      const created = makeItems(media);
      setItems(created);
      setView({ kind: "mountain", id: created[0].id });
    },
    [makeItems],
  );

  // 一覧から写真を追加（末尾へ）。
  const onAdd = useCallback(
    (media: PickedMedia[]) => {
      setItems((prev) => [...prev, ...makeItems(media)]);
    },
    [makeItems],
  );

  // 一覧のタイルをタップ: 山未選択なら山選びへ、選択済みなら仕上げへ。
  const onOpen = useCallback(
    (id: number) => {
      const it = items.find((x) => x.id === id);
      if (!it) return;
      setView(it.labels ? { kind: "studio", id } : { kind: "mountain", id });
    },
    [items],
  );

  // 山選び完了 → その写真の仕上げへ。山を選び直したら古い編集状態は破棄する。
  const onMountainDone = useCallback((id: number, labels: ArLabel[]) => {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, labels, snapshot: null } : x)));
    setView({ kind: "studio", id });
  }, []);

  // 仕上げ画面の状態を item に保存する（一覧へ戻る・次へ進む時）。
  const saveStudioState = useCallback((id: number, snapshot: StudioSnapshot | null, exportBlob: Blob | null) => {
    setItems((prev) =>
      prev.map((x) =>
        x.id === id
          ? { ...x, snapshot: snapshot ?? x.snapshot, exportBlob: exportBlob ?? x.exportBlob }
          : x,
      ),
    );
  }, []);

  // 仕上げ → 一覧へ。
  const onStudioExit = useCallback(
    (id: number) => (snapshot: StudioSnapshot | null, exportBlob: Blob | null) => {
      saveStudioState(id, snapshot, exportBlob);
      setView({ kind: "board" });
    },
    [saveStudioState],
  );

  // 仕上げ → 次のまだ書き出していない写真へ（現在の次から探して一巡）。無ければ一覧へ。
  const onStudioNext = useCallback(
    (id: number) => (snapshot: StudioSnapshot | null, exportBlob: Blob | null) => {
      saveStudioState(id, snapshot, exportBlob);
      const idx = items.findIndex((x) => x.id === id);
      const rest = [...items.slice(idx + 1), ...items.slice(0, idx)];
      const next = rest.find((x) => !x.exportBlob);
      if (next) {
        setView(next.labels ? { kind: "studio", id: next.id } : { kind: "mountain", id: next.id });
      } else {
        setView({ kind: "board" });
      }
    },
    [items, saveStudioState],
  );

  // 山選びへ戻る（仕上げ画面から）。
  const onReselect = useCallback((id: number) => () => setView({ kind: "mountain", id }), []);

  // ホームへ: すべての写真・動画URLを解放して破棄。
  const onHome = useCallback(() => {
    setItems((prev) => {
      prev.forEach((x) => {
        URL.revokeObjectURL(x.photoUrl);
        if (x.videoUrl) URL.revokeObjectURL(x.videoUrl);
      });
      return [];
    });
    setView({ kind: "home" });
  }, []);

  if (view.kind === "board") {
    return <Board items={items} onOpen={onOpen} onAdd={onAdd} onHome={onHome} />;
  }
  if (view.kind === "mountain" || view.kind === "studio") {
    const it = items.find((x) => x.id === view.id);
    if (it) {
      if (view.kind === "mountain") {
        const idx = items.findIndex((x) => x.id === view.id);
        return (
          <MountainPicker
            key={it.id}
            photoUrl={it.photoUrl}
            photoIndex={idx + 1}
            photoTotal={items.length}
            onStart={(labels) => onMountainDone(it.id, labels)}
            onBoard={() => setView({ kind: "board" })}
          />
        );
      }
      const restCount = items.filter((x) => x.id !== it.id && !x.exportBlob).length;
      return (
        <Studio
          key={it.id}
          photoUrl={it.photoUrl}
          videoUrl={it.videoUrl}
          initialLabels={it.labels ?? []}
          initialSnapshot={it.snapshot}
          onExit={onStudioExit(it.id)}
          onReselect={onReselect(it.id)}
          nextCount={restCount}
          onNext={restCount > 0 ? onStudioNext(it.id) : undefined}
        />
      );
    }
  }
  return <Picker onPick={onPick} />;
}
