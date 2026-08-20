"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import type { Incident } from "@/lib/incidents";

interface Props {
  incident: Incident | null;
  onClose: () => void;
  onMapClick?: () => void;
}

const categoryEmojis: Record<string, string> = {
  火災: "🔥",
  事故: "🚗",
  災害: "⛈️",
  通信障害: "📡",
  その他: "⚠️",
};

const urgencyColors = {
  high: "bg-red-100 text-red-800 border-red-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  low: "bg-blue-100 text-blue-800 border-blue-300",
};

const urgencyLabels = {
  high: "🔴 緊急",
  medium: "🟡 中",
  low: "🔵 低",
};

export default function IncidentModal({ incident, onClose, onMapClick }: Props) {
  const router = useRouter();
  const { profile } = useAuth();

  if (!incident) return null;

  const handleMapClick = () => {
    onClose();
    onMapClick?.();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDispatchCreate = () => {
    router.push(`/dispatch/new?incidentId=${incident.id}`);
  };

  const detectedAt = incident.detectedAt?.toDate?.();
  const dateStr = detectedAt
    ? detectedAt.toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "日時不明";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/40"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-200 p-4 flex items-start justify-between gap-2">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <span className="text-2xl flex-shrink-0 animate-pulse">🚨</span>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-lg text-gray-900 leading-tight break-words">
                  {incident.title}
                </h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none flex-shrink-0"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="p-5 space-y-4">
            {/* Category & Urgency Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg">
                {categoryEmojis[incident.category] || "⚠️"}
              </span>
              <span className="text-sm font-medium text-gray-700">
                {incident.category}
              </span>
              <span
                className={`text-xs px-3 py-1 rounded-full font-semibold border ${
                  urgencyColors[incident.urgency]
                }`}
              >
                {urgencyLabels[incident.urgency]}
              </span>
            </div>

            {/* Date & Location */}
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="text-gray-600 min-w-fit">📅 検知日時:</span>
                <span className="text-gray-900">{dateStr}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-600 min-w-fit">📍 推定場所:</span>
                <span className="text-gray-900">{incident.locationName}</span>
              </div>
            </div>

            {/* Divider */}
            <hr className="border-gray-200" />

            {/* Description */}
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-900 text-sm">詳細説明</h3>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {incident.description}
              </p>
            </div>

            {/* Divider */}
            <hr className="border-gray-200" />

            {/* Action Buttons */}
            <div className="space-y-3 pt-2">
              <button
                onClick={handleMapClick}
                className="w-full text-sm bg-white border-2 border-red-300 text-red-700 hover:bg-red-50 rounded-lg px-4 py-3 transition-colors font-medium flex items-center justify-center gap-2"
              >
                📍 マップで見る
              </button>
              <button
                onClick={handleDispatchCreate}
                className="w-full text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg px-4 py-3 transition-colors font-medium flex items-center justify-center gap-2"
              >
                🎥 この現場へ出動作成
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
