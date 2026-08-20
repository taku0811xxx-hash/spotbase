"use client";

import { useState } from "react";
import Link from "next/link";
import type { Incident } from "@/lib/incidents";

interface Props {
  incidents: Incident[];
  organizationId?: string;
}

const urgencyColors = {
  high: "bg-red-50 border-red-200",
  medium: "bg-yellow-50 border-yellow-200",
  low: "bg-blue-50 border-blue-200",
};

const urgencyBadgeColors = {
  high: "bg-red-100 text-red-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-blue-100 text-blue-800",
};

const categoryEmojis: Record<string, string> = {
  火災: "🔥",
  事故: "🚗",
  災害: "⛈️",
  通信障害: "📡",
  その他: "⚠️",
};

export default function IncidentAlert({ incidents }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (incidents.length === 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-300 rounded-xl shadow-lg">
      {/* Compact header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left p-3 sm:p-4 hover:bg-red-100/50 transition-colors active:scale-[0.98]"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-xl sm:text-2xl animate-pulse flex-shrink-0">🚨</span>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-red-900 text-sm sm:text-base truncate">
                もしかして今起きてる？
              </h3>
              <p className="text-[11px] sm:text-xs text-red-800">
                {incidents.length}件の速報
              </p>
            </div>
          </div>
          <span className={`text-lg sm:text-xl flex-shrink-0 transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}>
            ▼
          </span>
        </div>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-red-300 p-3 sm:p-4 space-y-2 max-h-[60vh] overflow-y-auto">
          {incidents.map((incident) => (
            <div
              key={incident.id}
              className={`border-l-4 border-l-red-500 ${urgencyColors[incident.urgency]} border rounded-lg p-3 transition-all hover:shadow-md`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-lg sm:text-xl">
                      {categoryEmojis[incident.category] || "⚠️"}
                    </span>
                    <h4 className="font-semibold text-gray-900 text-sm truncate">
                      {incident.title}
                    </h4>
                    <span
                      className={`text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap flex-shrink-0 ${urgencyBadgeColors[incident.urgency]}`}
                    >
                      {incident.urgency === "high"
                        ? "🔴 緊急"
                        : incident.urgency === "medium"
                          ? "🟡 中"
                          : "🔵 低"}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-700 mb-1">
                    {incident.description}
                  </p>
                  <p className="text-[10px] sm:text-xs text-gray-500">
                    📍 {incident.locationName}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    // マップにズーム・スクロール（後で実装）
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="flex-1 text-[11px] sm:text-sm bg-white border border-red-300 text-red-700 hover:bg-red-50 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 transition-colors font-medium"
                >
                  📍 マップで見る
                </button>
                <Link
                  href={`/dispatch/new?incidentId=${incident.id}`}
                  className="flex-1 text-[11px] sm:text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 transition-colors font-medium text-center"
                >
                  🎥 出動作成
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
