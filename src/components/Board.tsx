import { useRef } from "react";
import { useModeT } from "../lib/useModeT";
import { IconImage } from "./icons";
import { oneLineName } from "../lib/labels";
import type { WorkItem } from "../App";

type Props = {
  items: WorkItem[];
  // タイルをタップ: 山未選択なら山選びへ、選択済みなら仕上げへ（App側で振り分け）。
  onOpen: (id: number) => void;
  // 写真を追加（末尾に足す）。
  onAdd: (photoUrls: string[]) => void;
  // すべて破棄してホームへ。
  onHome: () => void;
};

// 写真一覧（ハブ画面）: 進み方は自由。好きな写真から順に仕上げる。保存は各写真の仕上げ画面から。
export default function Board({ items, onOpen, onAdd, onHome }: Props) {
  const { t } = useModeT();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const saved = items.filter((it) => it.saved);

  const onPickMore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => !f.type || f.type.startsWith("image/"));
    e.target.value = "";
    if (files.length === 0) return;
    onAdd(files.map((f) => URL.createObjectURL(f)));
  };

  const status = (it: WorkItem) =>
    it.saved
      ? ("done" as const)
      : it.snapshot
        ? ("editing" as const)
        : it.labels
          ? ("noTheme" as const)
          : ("todo" as const);
  const STATUS_LABEL = {
    todo: t("board.statusTodo"),
    noTheme: t("board.statusNoTheme"),
    editing: t("board.statusEditing"),
    done: t("board.statusDone"),
  };

  return (
    <div className="pick-screen">
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onPickMore} />
      <div className="board-head">
        <header className="pick-next-head">
          <p className="kicker">Works</p>
          <h1>{t("board.heading")}</h1>
          <p>{t("board.summary", { total: items.length, saved: saved.length })}</p>
        </header>
      </div>

      {/* 余白なしのフォトグリッド（画面幅いっぱい）。番号・状態は写真の上に重ねる */}
      <div className="board-grid">
        {items.map((it, i) => {
          const st = status(it);
          return (
            <button key={it.id} type="button" className={`board-tile is-${st}`} onClick={() => onOpen(it.id)}>
              <img src={it.photoUrl} alt={t("board.photoAlt", { n: i + 1 })} loading="lazy" />
              <span className="board-tile-veil" aria-hidden="true" />
              <span className="board-tile-meta">
                <span className="board-tile-no">{String(i + 1).padStart(2, "0")}</span>
                {it.labels && <span className="board-tile-name">{oneLineName(it.labels[0]?.name ?? "")}</span>}
                <span className={`board-tile-status is-${st}`}>{st === "done" ? "✓ " : ""}{STATUS_LABEL[st]}</span>
              </span>
            </button>
          );
        })}
        {/* 写真の追加タイル */}
        <button type="button" className="board-tile board-tile--add" onClick={() => fileRef.current?.click()}>
          <IconImage size={20} />
          {t("board.addPhotos")}
        </button>
      </div>

      <div className="board-foot">
        <div className="pick-home-row">
          <button type="button" className="pick-photo-change" onClick={onHome}>
            {t("board.backToHome")}
          </button>
        </div>
      </div>
    </div>
  );
}
