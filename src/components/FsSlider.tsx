import { useRef } from "react";

// 仕上げパネル用のカスタムスライダー（ネイティブ <input type="range"> の置き換え）。
// ネイティブをやめる理由:
//  - トラックのどこを触っても値がジャンプするため、パネルの縦スクロール中に指が
//    かすっただけで設定が書き換わる誤操作が多発する
//  - iOS WebKit はつまみに正確に触れないとドラッグを開始できず、「タップでしか
//    動かせない」操作感になる
// 挙動:
//  - 値を変えられるのは「つまみ（当たり判定は見た目より大きい）を掴んだドラッグ」だけ。
//    トラックをタップ・スワイプしても値は変わらず、縦スワイプはそのままスクロールになる
//  - つまみは setPointerCapture で掴み続けるので、指が上下にぶれても追従する
//  - つまみ上でも縦スワイプはブラウザがスクロールとして引き取る（touch-action: pan-y）。
//    その際 pointercancel が来るので、動いてしまった値は掴んだ時点へ戻す
type Props = {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  ariaLabel: string;
};

export default function FsSlider({ min, max, step, value, onChange, ariaLabel }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: number; startX: number; startValue: number; engaged: boolean } | null>(null);

  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  // step 刻みへ丸める。0.05 等の浮動小数の蓄積誤差は step の桁数で切り落とす。
  const snap = (v: number) => {
    const digits = (String(step).split(".")[1] ?? "").length;
    return clamp(Number((min + Math.round((v - min) / step) * step).toFixed(digits)));
  };
  const ratio = (max - min > 0 ? (clamp(value) - min) / (max - min) : 0) * 100;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { id: e.pointerId, startX: e.clientX, startValue: value, engaged: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const root = rootRef.current;
    if (!d || d.id !== e.pointerId || !root) return;
    const dx = e.clientX - d.startX;
    // タップ時の数pxのぶれでは値を動かさない。
    if (!d.engaged && Math.abs(dx) < 3) return;
    d.engaged = true;
    const w = root.getBoundingClientRect().width;
    if (w > 0) onChange(snap(d.startValue + (dx / w) * (max - min)));
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null;
  };
  // ブラウザが縦スクロールと判断してジェスチャを引き取った。ドラッグ中に動いた値は
  // 誤操作なので掴んだ時点の値へ戻す。
  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    if (d.engaged) onChange(snap(d.startValue));
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    onChange(snap(clamp(value) + dir * step));
  };

  return (
    <div className="fs-slider" ref={rootRef}>
      <span className="fs-slider-track" aria-hidden="true" />
      <div
        className="fs-slider-thumb"
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clamp(value)}
        style={{ left: `${ratio}%` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
