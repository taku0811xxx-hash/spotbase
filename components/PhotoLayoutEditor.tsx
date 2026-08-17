"use client";

import { useRef, useState } from "react";

export type PhotoPosition = {
  url: string;
  caption: string;
  xPct: number; // 配置エリアに対する左位置(%)
  yPct: number; // 配置エリアに対する上位置(%)
  widthPct: number; // 配置エリアに対する幅(%)
};

const DEFAULT_WIDTH_PCT = 28;

// 写真をグリッド状の初期位置に並べる
export function createInitialPositions(
  photos: { url: string; caption: string }[]
): PhotoPosition[] {
  const cols = 3;
  const gap = 3;
  return photos.map(({ url, caption }, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      url,
      caption,
      xPct: 2 + col * (DEFAULT_WIDTH_PCT + gap),
      yPct: 2 + row * (DEFAULT_WIDTH_PCT * 0.75 + gap + 4),
      widthPct: DEFAULT_WIDTH_PCT,
    };
  });
}

type Props = {
  positions: PhotoPosition[];
  onChange: (positions: PhotoPosition[]) => void;
  editable?: boolean;
};

// A4比率(210:297)の配置エリア。ドラッグで写真の位置を調整できる。
// print:時にはこの見た目のまま印刷され、PDF出力の実体になる。
export default function PhotoLayoutEditor({ positions, onChange, editable = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{ index: number; offsetXPct: number; offsetYPct: number } | null>(
    null
  );
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  function handlePointerDown(e: React.PointerEvent, index: number) {
    if (!editable || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pos = positions[index];
    const pointerXPct = ((e.clientX - rect.left) / rect.width) * 100;
    const pointerYPct = ((e.clientY - rect.top) / rect.height) * 100;
    draggingRef.current = {
      index,
      offsetXPct: pointerXPct - pos.xPct,
      offsetYPct: pointerYPct - pos.yPct,
    };
    setDraggingIndex(index);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!draggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const { index, offsetXPct, offsetYPct } = draggingRef.current;
    const pointerXPct = ((e.clientX - rect.left) / rect.width) * 100;
    const pointerYPct = ((e.clientY - rect.top) / rect.height) * 100;

    const next = [...positions];
    const p = next[index];
    const maxX = 100 - p.widthPct;
    next[index] = {
      ...p,
      xPct: Math.min(Math.max(pointerXPct - offsetXPct, 0), Math.max(maxX, 0)),
      yPct: Math.min(Math.max(pointerYPct - offsetYPct, 0), 92),
    };
    onChange(next);
  }

  function handlePointerUp() {
    draggingRef.current = null;
    setDraggingIndex(null);
  }

  function handleResize(index: number, deltaPct: number) {
    const next = [...positions];
    const p = next[index];
    const newWidth = Math.min(Math.max(p.widthPct + deltaPct, 10), 80);
    next[index] = { ...p, widthPct: newWidth };
    onChange(next);
  }

  return (
    <div
      ref={containerRef}
      className="relative bg-white border border-gray-300 mx-auto select-none"
      style={{ width: "100%", aspectRatio: "210 / 297" }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {positions.map((p, i) => (
        <div
          key={p.url + i}
          className={`absolute group ${editable ? "cursor-move" : ""} ${
            draggingIndex === i ? "z-10 ring-2 ring-blue-500" : ""
          }`}
          style={{ left: `${p.xPct}%`, top: `${p.yPct}%`, width: `${p.widthPct}%` }}
          onPointerDown={(e) => handlePointerDown(e, i)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.url}
            alt={p.caption || ""}
            draggable={false}
            className="w-full h-auto rounded shadow-sm pointer-events-none"
          />
          {p.caption && (
            <p className="text-[10px] text-gray-600 text-center mt-0.5 leading-tight">
              {p.caption}
            </p>
          )}
          {editable && (
            <div className="print:hidden absolute -bottom-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => handleResize(i, -5)}
                className="w-6 h-6 rounded-full bg-white border border-gray-300 text-xs shadow-sm hover:bg-gray-50"
              >
                −
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => handleResize(i, 5)}
                className="w-6 h-6 rounded-full bg-white border border-gray-300 text-xs shadow-sm hover:bg-gray-50"
              >
                ＋
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
