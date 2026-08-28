"use client";

import { useMemo, useState } from "react";
import type { Pin } from "@/lib/pins";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  pins: Pin[];
  onSelectExisting: (pin: Pin) => void;
  onCreateNew: (input: { name: string; addressQuery: string }) => void;
  submitting?: boolean;
  errorMessage?: string;
}

/**
 * 新規出動フロー用の現場選択・現場登録モーダル。
 * - 検索窓で登録済みの現場(ピン)を名前・住所・地名で絞り込み、選ぶだけで
 *   即座に「出動中」状態へ移行できる
 * - 該当する現場が見つからない場合、または初めての現場の場合は、
 *   現場名(と、わかれば住所/建物名)を入力してその場で新しい現場を登録し、
 *   そのまま出動を開始できる。住所を空欄にした場合は現在地(GPS)を使って登録する
 */
export default function NewDispatchModal({
  isOpen,
  onClose,
  pins,
  onSelectExisting,
  onCreateNew,
  submitting = false,
  errorMessage,
}: Props) {
  const [query, setQuery] = useState("");
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteAddress, setNewSiteAddress] = useState("");

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

  const hasNoMatch = query.trim().length > 0 && filtered.length === 0;

  if (!isOpen) return null;

  function handleCreateNew() {
    if (!newSiteName.trim() || submitting) return;
    onCreateNew({ name: newSiteName.trim(), addressQuery: newSiteAddress.trim() });
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
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
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

        {/* 既存現場の絞り込み検索 */}
        <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
            既存の現場を検索
          </label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="現場名・住所・地名で絞り込み"
            disabled={submitting}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            autoFocus
          />
          <p className="text-[11px] text-gray-500 mt-1.5">
            選んだ現場で即座に「出動中」の記録を作成し、GPSとチャットのライブ画面を開きます。
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 min-h-[80px]">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">
              {pins.length === 0
                ? "登録済みの現場がまだありません。下記から新規現場を登録してください"
                : "一致する現場が見つかりません。下記から新規現場を登録できます"}
            </p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((pin) => (
                <li key={pin.id}>
                  <button
                    onClick={() => onSelectExisting(pin)}
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

        {/* 見つからない場合・初めての現場: その場で新しい現場を登録して出動 */}
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex-shrink-0 space-y-2">
          <p className="text-xs font-semibold text-gray-700">
            {hasNoMatch ? "見つからない場合は" : "初めての現場は"}新しい現場を登録して出動できます
          </p>
          <input
            type="text"
            value={newSiteName}
            onChange={(e) => setNewSiteName(e.target.value)}
            placeholder="現場名(例: ○○ビル前)"
            disabled={submitting}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
          <input
            type="text"
            value={newSiteAddress}
            onChange={(e) => setNewSiteAddress(e.target.value)}
            placeholder="住所または建物名(空欄の場合は現在地を使用)"
            disabled={submitting}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateNew();
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
          {errorMessage && (
            <p className="text-xs text-red-600">{errorMessage}</p>
          )}
          <button
            onClick={handleCreateNew}
            disabled={!newSiteName.trim() || submitting}
            className="w-full py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "登録中..." : "この内容で新しい現場を登録して出動"}
          </button>
        </div>
      </div>
    </div>
  );
}
