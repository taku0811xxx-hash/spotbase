"use client";

import { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onStart: (siteName: string) => void;
  submitting?: boolean;
  errorMessage?: string;
}

/**
 * 新規出動フロー用のモーダル。
 * 入力項目は「現場名」のみに簡略化されており、入力して決定すると
 * 即座に現在地を使って現場登録・出動記録の作成が行われ、出動中画面へ遷移する。
 */
export default function NewDispatchModal({
  isOpen,
  onClose,
  onStart,
  submitting = false,
  errorMessage,
}: Props) {
  const [siteName, setSiteName] = useState("");

  if (!isOpen) return null;

  function handleStart() {
    if (!siteName.trim() || submitting) return;
    onStart(siteName.trim());
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60"
        onClick={submitting ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Modal Body */}
      <div className="relative w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h2 className="font-bold text-gray-900 text-sm sm:text-base">新規出動</h2>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none disabled:opacity-40"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">現場名</label>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="例: ○○ビル前"
              disabled={submitting}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleStart();
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
            <p className="text-[11px] text-gray-500 mt-1.5">
              現在地を使って現場を登録し、即座に「出動中」の記録を作成してGPSとチャットのライブ画面を開きます。
            </p>
          </div>

          {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}

          <button
            onClick={handleStart}
            disabled={!siteName.trim() || submitting}
            className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "出動を開始しています..." : "出動開始"}
          </button>
        </div>
      </div>
    </div>
  );
}
