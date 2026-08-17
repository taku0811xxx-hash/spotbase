"use client";

import { useState } from "react";
import { suggestShootingPositions, type ShootingSuggestion } from "@/lib/shootingSuggestions";

type Props = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

export default function ShootingSuggestionPanel({ name, address, lat, lng }: Props) {
  const [suggestions, setSuggestions] = useState<ShootingSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerate() {
    setLoading(true);
    setError("");
    try {
      const result = await suggestShootingPositions(name, address, lat, lng);
      setSuggestions(result);
    } catch (err) {
      console.error(err);
      setError("AI提案の生成に失敗しました。時間をおいて再度お試しください");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-t pt-3">
      <p className="text-xs font-medium text-gray-700 mb-1">
        AIによる撮影ポジション提案
      </p>

      {!suggestions && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium text-purple-700 border border-purple-200 bg-purple-50 rounded-lg px-3 py-1.5 hover:bg-purple-100 hover:border-purple-300 hover:shadow-sm active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
        >
          {loading ? (
            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
            </svg>
          )}
          {loading ? "生成中..." : "AI提案を生成"}
        </button>
      )}

      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}

      {suggestions && (
        <div className="space-y-2 mt-2">
          {suggestions.map((s, i) => (
            <div key={i} className="bg-purple-50 border border-purple-100 rounded-lg p-2.5">
              <p className="text-xs font-semibold text-gray-800">
                {i + 1}. {s.position}({s.direction})
              </p>
              <p className="text-xs text-gray-600 mt-0.5">{s.reason}</p>
            </div>
          ))}
          <p className="text-[11px] text-gray-400">
            ※ AIが地図データをもとに推測した参考案です。断定はできません。必ず現地で確認してください。
          </p>
        </div>
      )}
    </div>
  );
}
