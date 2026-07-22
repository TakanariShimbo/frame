import { useRef, useState } from "react";
import { IconImage, IconDownload } from "./icons";
import { buildZip } from "../lib/zip";
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

// ファイル名に使えない文字を除いて短くする。
const safeName = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, "").slice(0, 24) || "frame";

// 写真一覧（ハブ画面）: 進み方は自由。好きな写真から仕上げ、まとめて保存もここから。
export default function Board({ items, onOpen, onAdd, onHome }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [zipping, setZipping] = useState(false);

  const exported = items.filter((it) => it.exportBlob);

  const onPickMore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => !f.type || f.type.startsWith("image/"));
    e.target.value = "";
    if (files.length === 0) return;
    onAdd(files.map((f) => URL.createObjectURL(f)));
  };

  // 書き出し済みの全作品をZIPでまとめて保存。
  const onSaveAll = async () => {
    if (exported.length === 0 || zipping) return;
    setZipping(true);
    try {
      const zip = await buildZip(
        exported.map((it, i) => ({
          name: `${String(i + 1).padStart(2, "0")}-${safeName(it.labels?.[0]?.name ?? "frame")}.jpg`,
          blob: it.exportBlob!,
        })),
      );
      const href = URL.createObjectURL(zip);
      const a = document.createElement("a");
      a.href = href;
      a.download = "frame-works.zip";
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    } finally {
      setZipping(false);
    }
  };

  const status = (it: WorkItem) =>
    it.exportBlob
      ? ("done" as const)
      : it.snapshot
        ? ("editing" as const)
        : it.labels
          ? ("noTheme" as const)
          : ("todo" as const);
  const STATUS_LABEL = { todo: "山を選ぶ", noTheme: "テーマ未選択", editing: "編集中", done: "仕上げ済み" };

  return (
    <div className="pick-screen">
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onPickMore} />
      <div className="board-head">
        <header className="pick-next-head">
          <p className="kicker">Works</p>
          <h1>写真一覧</h1>
          <p>
            {items.length}枚中 {exported.length}枚が仕上げ済み。写真をタップして、好きな順に仕上げてください。
          </p>
        </header>
      </div>

      {/* 余白なしのフォトグリッド（画面幅いっぱい）。番号・状態は写真の上に重ねる */}
      <div className="board-grid">
        {items.map((it, i) => {
          const st = status(it);
          return (
            <button key={it.id} type="button" className={`board-tile is-${st}`} onClick={() => onOpen(it.id)}>
              <img src={it.photoUrl} alt={`${i + 1}枚目`} loading="lazy" />
              <span className="board-tile-veil" aria-hidden="true" />
              <span className="board-tile-meta">
                <span className="board-tile-no">{String(i + 1).padStart(2, "0")}</span>
                {it.labels && <span className="board-tile-name">{it.labels[0]?.name}</span>}
                <span className={`board-tile-status is-${st}`}>{st === "done" ? "✓ " : ""}{STATUS_LABEL[st]}</span>
              </span>
            </button>
          );
        })}
        {/* 写真の追加タイル */}
        <button type="button" className="board-tile board-tile--add" onClick={() => fileRef.current?.click()}>
          <IconImage size={20} />
          写真を追加
        </button>
      </div>

      <div className="board-foot">
        <div className="board-actions">
          <button
            type="button"
            className="ar-btn-main"
            onClick={onSaveAll}
            disabled={exported.length === 0 || zipping}
            title={exported.length === 0 ? "テーマを選んで仕上げ画面に入ると、まとめて保存できるようになります" : undefined}
          >
            <IconDownload size={15} />
            {zipping ? "作成中…" : `まとめて保存（${exported.length}枚）`}
          </button>
          {exported.length < items.length && (
            <p className="pick-hint">まとめて保存に含まれるのは、テーマを選んで仕上げまで進んだ写真です。</p>
          )}
        </div>

        <div className="pick-home-row">
          <button type="button" className="pick-photo-change" onClick={onHome}>
            ホームへ戻る（すべて破棄）
          </button>
        </div>
      </div>
    </div>
  );
}
