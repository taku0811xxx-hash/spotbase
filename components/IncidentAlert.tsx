"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Incident } from "@/lib/incidents";
import { getHighUrgencyIncidents } from "@/lib/incidents";

interface Props {
  organizationId: string;
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

export default function IncidentAlert({ organizationId }: Props) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadIncidents() {
      try {
        const data = await getHighUrgencyIncidents(organizationId, 5);
        setIncidents(data);
      } catch (error) {
        console.warn("Failed to load incidents (permissions or not initialized):", error);
        // Firestore ルールが未設定の場合は空配列を返す（エラーは無視）
        setIncidents([]);
      } finally {
        setLoading(false);
      }
    }

    loadIncidents();
  }, [organizationId]);

  if (loading || incidents.length === 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-300 rounded-xl p-4 mb-4 shadow-lg">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl animate-pulse">🚨</span>
        <h3 className="font-bold text-red-900 text-lg">
          もしかして今起きてる？
        </h3>
        <span className="text-xs bg-red-600 text-white px-2 py-1 rounded-full font-semibold">
          リアルタイム検知
        </span>
      </div>

      <div className="space-y-2">
        {incidents.map((incident) => (
          <div
            key={incident.id}
            className={`border-l-4 border-l-red-500 ${urgencyColors[incident.urgency]} border rounded-lg p-3 transition-all hover:shadow-md`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">
                    {categoryEmojis[incident.category] || "⚠️"}
                  </span>
                  <h4 className="font-semibold text-gray-900 truncate">
                    {incident.title}
                  </h4>
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-semibold whitespace-nowrap flex-shrink-0 ${urgencyBadgeColors[incident.urgency]}`}
                  >
                    {incident.urgency === "high"
                      ? "🔴 緊急"
                      : incident.urgency === "medium"
                        ? "🟡 中"
                        : "🔵 低"}
                  </span>
                </div>
                <p className="text-sm text-gray-700 mb-1">
                  {incident.description}
                </p>
                <p className="text-xs text-gray-500">
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
                className="flex-1 text-sm bg-white border border-red-300 text-red-700 hover:bg-red-50 rounded-lg px-3 py-1.5 transition-colors font-medium"
              >
                📍 マップで見る
              </button>
              <Link
                href={`/dispatch/new?incidentId=${incident.id}`}
                className="flex-1 text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg px-3 py-1.5 transition-colors font-medium text-center"
              >
                🎥 出動作成
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
