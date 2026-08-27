"use client";

import { useMemo, useState } from "react";
import type { Pin } from "@/lib/pins";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  pins: Pin[];
  onSelect: (pin: Pin) => void;
  submitting?: boolean;
}

/**
 * 新規出動フロー用の現場選択モーダル。
 * 登録済みの現場(ピン)から出動先を選ぶだけで、詳細フォームの入力を待たずに
 * 即座に「出動中」状態へ移行できる簡易フローを提供する。
 */
export default function NewDispatchModal({ isOpen, onClose, pins, onSelect, submitting = false }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pins;
    return pins.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        (p.parentLocation || "").toLowerCase().includes(q)
    );
  }, [pins, query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60"
        onClick={submitting ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Modal Body */}
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h2 className="font-bold text-gray-900 text-sm sm:text-base">新規出動 - 出動先を選択</h2>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none disabled:opacity-40"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="現場名・住所・地名で絞り込み"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <p className="text-[11px] text-gray-500 mt-1.5">
            選んだ現場で即座に「出動中」の記録を作成し、GPSとチャットのライブ画面を開きます。
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              一致する現場が見つかりません
            </p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((pin) => (
                <li key={pin.id}>
                  <button
                    onClick={() => onSelect(pin)}
                    disabled={submitting}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-wait"
                  >
                    <p className="font-medium text-gray-900 text-sm truncate">
                      {pin.parentLocation ? `${pin.parentLocation} / ` : ""}
                      {pin.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{pin.address}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {submitting && (
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-blue-600 flex-shrink-0">
            出動記録を作成中...
          </div>
        )}
      </div>
    </div>
  );
}
