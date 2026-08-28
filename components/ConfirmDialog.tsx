"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type SummaryItem = { label: string; value: string };

type Props = {
  open: boolean;
  title: string;
  summary: SummaryItem[];
  confirmLabel?: string;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * 確認ダイアログ(削除確認・登録確認など)。
 *
 * React Portal で document.body 直下に描画することで、地図(Leaflet)コンテナや
 * 親要素の overflow/transform によるスタッキングコンテキストの影響を受けず、
 * 常に画面の最前面に表示されるようにしている(MobileMenuPortalと同じ方針)。
 * z-[9999] は Leaflet のタイル/コントロール(z-index: 200〜2000程度)より
 * 確実に上に来るよう十分高い値にしている。
 */
export default function ConfirmDialog({
  open,
  title,
  summary,
  confirmLabel = "この内容で登録する",
  submitting,
  onCancel,
  onConfirm,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open) return null;
  // ハイドレーション完了 + document.body が存在するまでは描画しない
  if (!mounted || typeof window === "undefined" || !document.body) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{title}</h2>
        </div>

        <div className="p-5 space-y-3">
          {summary.map((item) => (
            <div key={item.label}>
              <p className="text-xs text-gray-500">{item.label}</p>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">
                {item.value || "(未入力)"}
              </p>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-100 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 font-medium hover:bg-gray-50 hover:border-gray-400 hover:shadow-sm active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
          >
            戻る
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 font-medium shadow-sm hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {submitting ? "登録中..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
