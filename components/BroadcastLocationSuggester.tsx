"use client";

import { useState } from "react";
import { suggestBroadcastLocations, type BroadcastLocationCandidate } from "@/lib/suggestBroadcastLocations";
import { type BroadcastLocationSuggestion } from "@/app/api/suggest-locations/route";

type Props = {
  lat: number | null;
  lng: number | null;
  incidentType: string;
  address: string;
  organizationId: string;
  category: string;
  isAdmin: boolean;
  onSelect: (field: "shootingSpots" | "parkingInfo", name: string, lat: number, lng: number) => void;
};

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  );
}

export default function BroadcastLocationSuggester({
  lat,
  lng,
  incidentType,
  address,
  organizationId,
  category,
  isAdmin,
  onSelect,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<BroadcastLocationSuggestion | null>(null);
  const [candidates, setCandidates] = useState<BroadcastLocationCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSuggest = async () => {
    if (!lat || !lng || !incidentType) {
      setError("場所・事象タイプを入力してください");
      return;
    }

    setLoading(true);
    setError(null);
    setSuggestion(null);

    try {
      // ステップ1: 候補を収集
      const collectedCandidates = await suggestBroadcastLocations(lat, lng, incidentType, {
        organizationId,
        category,
        isAdmin,
      });

      if (collectedCandidates.length === 0) {
        setError("候補地点が見つかりませんでした");
        setLoading(false);
        return;
      }

      setCandidates(collectedCandidates);

      // ステップ2: AIでスコアリング
      const res = await fetch("/api/suggest-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidates: collectedCandidates,
          incidentType,
          address,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "提案の生成に失敗しました");
        setLoading(false);
        return;
      }

      const data = await res.json();
      setSuggestion(data.suggestion);
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setSuggestion(null);
    setCandidates([]);
    setError(null);
  };

  const handleSelectForField = (field: "shootingSpots" | "parkingInfo", location: BroadcastLocationSuggestion["recommended"]) => {
    onSelect(field, location.name, location.lat, location.lng);
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-blue-900 flex items-center gap-2">
          <span>🎥 中継候補地を提案</span>
        </h3>
        {suggestion && (
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            リセット
          </button>
        )}
      </div>

      {!suggestion ? (
        <button
          type="button"
          onClick={handleSuggest}
          disabled={loading}
          className="w-full bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Spinner className="w-4 h-4" />
              分析中...
            </>
          ) : (
            "提案を取得"
          )}
        </button>
      ) : (
        <div className="space-y-3">
          {/* 本命 */}
          <div className="bg-white border border-green-300 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎥</span>
              <div className="flex-1">
                <p className="font-semibold text-gray-800">{suggestion.recommended.name}</p>
                <p className="text-xs text-gray-600">{suggestion.recommended.reason}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleSelectForField("shootingSpots", suggestion.recommended)}
                className="flex-1 bg-green-600 text-white text-xs px-3 py-1.5 rounded hover:bg-green-700 transition-colors"
              >
                撮影ポイントに設定
              </button>
            </div>
          </div>

          {/* 対抗 */}
          <div className="bg-white border border-orange-300 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎬</span>
              <div className="flex-1">
                <p className="font-semibold text-gray-800">{suggestion.alternative.name}</p>
                <p className="text-xs text-gray-600">{suggestion.alternative.reason}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleSelectForField("shootingSpots", suggestion.alternative)}
                className="flex-1 bg-orange-600 text-white text-xs px-3 py-1.5 rounded hover:bg-orange-700 transition-colors"
              >
                撮影ポイントに設定
              </button>
            </div>
          </div>

          {/* 待機駐車場 */}
          <div className="bg-white border border-blue-300 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">🅿️</span>
              <div className="flex-1">
                <p className="font-semibold text-gray-800">{suggestion.parking.name}</p>
                <p className="text-xs text-gray-600">{suggestion.parking.reason}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleSelectForField("parkingInfo", suggestion.parking)}
                className="flex-1 bg-blue-600 text-white text-xs px-3 py-1.5 rounded hover:bg-blue-700 transition-colors"
              >
                駐車場所に設定
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
