"use client";

import { useEffect, useRef, useState } from "react";
import {
  PIN_FILTER_KEYWORD_OPTIONS,
  type PinAttributeFilters,
  type PinUpdatedWithin,
} from "@/lib/pins";

interface Props {
  filters: PinAttributeFilters;
  onChange: (filters: PinAttributeFilters) => void;
  matchCount: number; // 現在の絞り込み条件に該当する現場数(ボタン・パネルに表示)
}

const UPDATED_WITHIN_OPTIONS: { id: PinUpdatedWithin; label: string }[] = [
  { id: "all", label: "すべて" },
  { id: "7d", label: "7日以内" },
  { id: "30d", label: "30日以内" },
  { id: "365d", label: "今年" },
];

// フリーワード検索バーとは別枠の「絞り込み」ボタン + ドロップダウンパネル。
// タグ的なキーワード・図面有無・最終更新日の3条件を組み合わせて現場ピンを絞り込む。
export default function PinAttributeFilter({ filters, onChange, matchCount }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const activeCount =
    filters.keywords.length +
    (filters.hasDrawings ? 1 : 0) +
    (filters.updatedWithin !== "all" ? 1 : 0);

  function toggleKeyword(keyword: string) {
    onChange({
      ...filters,
      keywords: filters.keywords.includes(keyword)
        ? filters.keywords.filter((k) => k !== keyword)
        : [...filters.keywords, keyword],
    });
  }

  function resetFilters() {
    onChange({ keywords: [], hasDrawings: false, updatedWithin: "all" });
  }

  return (
    <div className="relative flex-shrink-0" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex items-center gap-1 text-xs sm:text-sm font-medium rounded-lg px-2.5 sm:px-3 py-1.5 border transition-colors whitespace-nowrap ${
          activeCount > 0
            ? "bg-blue-600 text-white border-blue-600"
            : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
        }`}
      >
        <span>🔎 絞り込み</span>
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-white/20 text-[10px]">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-2xl z-[9999] p-3 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700">絞り込み条件</p>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-[11px] text-blue-600 hover:underline"
              >
                条件をクリア
              </button>
            )}
          </div>

          {/* タグ/カテゴリ絞り込み: 現場情報の文中にキーワードが含まれる現場だけに
              絞り込む簡易実装(複数選択時はすべてを満たす現場のみ表示)。 */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-gray-500">タグ</p>
            <div className="flex flex-wrap gap-1.5">
              {PIN_FILTER_KEYWORD_OPTIONS.map((keyword) => (
                <button
                  key={keyword}
                  type="button"
                  onClick={() => toggleKeyword(keyword)}
                  className={`text-[11px] font-medium rounded-full border px-2.5 py-1 transition-colors ${
                    filters.keywords.includes(keyword)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {keyword}
                </button>
              ))}
            </div>
          </div>

          {/* 図面有無 */}
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.hasDrawings}
              onChange={(e) => onChange({ ...filters, hasDrawings: e.target.checked })}
              className="rounded border-gray-300"
            />
            図面ありの現場のみ表示
          </label>

          {/* 最終更新日 */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-gray-500">最終更新日</p>
            <div className="flex flex-wrap gap-1.5">
              {UPDATED_WITHIN_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChange({ ...filters, updatedWithin: opt.id })}
                  className={`text-[11px] font-medium rounded-full border px-2.5 py-1 transition-colors ${
                    filters.updatedWithin === opt.id
                      ? "bg-gray-800 text-white border-gray-800"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-gray-400 border-t border-gray-100 pt-2">
            該当する現場: {matchCount}件
          </p>
        </div>
      )}
    </div>
  );
}
