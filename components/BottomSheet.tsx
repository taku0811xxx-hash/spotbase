"use client";

import { useEffect, useRef, useState } from "react";

type SheetState = "peek" | "half" | "full";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  isPeekable?: boolean; // true = peek/half/full states; false = full only
  peekHeight?: number; // px (default: 70)
  onStateChange?: (state: SheetState) => void;
}

export default function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
  isPeekable = false,
  peekHeight = 70,
  onStateChange,
}: Props) {
  const [state, setState] = useState<SheetState>(isPeekable ? "peek" : "full");
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const [startY, setStartY] = useState(0);

  useEffect(() => {
    // Only apply overflow:hidden on mobile (width < 768px)
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

    if (isOpen && isMobile) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isOpen]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isPeekable) return;
    setStartY(e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isPeekable) return;
    setStartY(e.touches[0].clientY);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isPeekable) return;
    handleDragEnd(e.clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isPeekable) return;
    handleDragEnd(e.changedTouches[0].clientY);
  };

  const handleDragEnd = (endY: number) => {
    if (!sheetRef.current) return;
    const diff = startY - endY; // positive = upward

    if (state === "peek") {
      if (diff > 50) {
        // Swipe up from peek -> half
        setState("half");
        onStateChange?.("half");
      }
    } else if (state === "half") {
      if (diff > 50) {
        // Swipe up from half -> full
        setState("full");
        onStateChange?.("full");
      } else if (diff < -50) {
        // Swipe down from half -> peek
        setState("peek");
        onStateChange?.("peek");
      }
    } else if (state === "full") {
      if (diff < -50) {
        // Swipe down from full -> half
        setState("half");
        onStateChange?.("half");
      }
    }
  };

  if (!isOpen) return null;

  // Determine height based on state
  let heightClass = "h-[85vh]"; // full
  if (isPeekable) {
    if (state === "peek") {
      heightClass = `h-[${peekHeight}px]`;
    } else if (state === "half") {
      heightClass = "h-1/2";
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden pointer-events-none shadow-lg" style={{ maxHeight: "100vh" }}>
      {/* Backdrop (only show in half/full state) - pointer-events-auto for closing */}
      {isPeekable && state !== "peek" && (
        <div
          className="fixed inset-0 bg-black/40 transition-opacity duration-300 z-[39] pointer-events-auto"
          onClick={onClose}
        />
      )}

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl overflow-hidden transition-all duration-300 pointer-events-auto ${heightClass}`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onMouseUp={handleMouseUp}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: "pan-y" }}
      >
        {/* Handle */}
        <div
          ref={handleRef}
          className="flex justify-center py-2 cursor-grab active:cursor-grabbing bg-gray-50 border-b border-gray-100 pointer-events-auto"
          role="slider"
          aria-label="ボトムシートの高さを調整"
        >
          <div className="w-12 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Title Bar */}
        {title && (
          <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between z-10">
            <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
            {!isPeekable && (
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div
          className={`${state === "peek" ? "px-4 py-2 h-full" : "px-4 pb-6"} ${state !== "peek" ? "overflow-y-auto" : "overflow-hidden"}`}
          style={{ touchAction: "pan-y" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
