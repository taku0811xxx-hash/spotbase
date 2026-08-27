"use client";

import { useState, memo } from "react";
import IncidentModal from "./IncidentModal";
import type { Incident } from "@/lib/incidents";

interface Props {
  incidents: Incident[];
  onMapNavigate?: (lat: number, lng: number) => void;
}

const categoryEmojis: Record<string, string> = {
  火災: "🔥",
  事故: "🚗",
  災害: "⛈️",
  通信障害: "📡",
  その他: "⚠️",
};

const IncidentAlert = memo(function IncidentAlert({ incidents, onMapNavigate }: Props) {
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  const handleMapClick = () => {
    if (selectedIncident && selectedIncident.latitude && selectedIncident.longitude) {
      onMapNavigate?.(selectedIncident.latitude, selectedIncident.longitude);
    }
  };

  // 最初の数件のみ表示（スペース節約）
  const displayIncidents = incidents.slice(0, 3);
  const hasIncidents = incidents.length > 0;

  return (
    <>
      {/* Incident Alert Banner - Responsive Layout */}
      {/* Mobile: 2-line layout | Desktop: 1-line layout */}
      <div className="bg-gradient-to-r from-red-100 to-orange-100 border border-red-300 px-2 sm:px-4 py-1 sm:py-2.5 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 overflow-hidden">

        {/* Line 1: Header (Alert icon + Label + Count Badge) */}
        <div className="flex items-center gap-1.5 flex-shrink-0 min-h-[22px] sm:min-h-auto">
          <span className={`text-sm sm:text-xl flex-shrink-0 ${hasIncidents ? "animate-pulse" : ""}`}>🚨</span>
          <span className="font-bold text-red-900 text-[11px] sm:text-sm whitespace-nowrap">
            もしかして今起きてる？
          </span>
          {/* Count Badge on mobile (right side of header) */}
          <span className="text-[9px] sm:hidden text-red-700 font-medium ml-auto flex-shrink-0">
            ({incidents.length}件)
          </span>
        </div>

        {/* Line 2 (Mobile) / Inline (Desktop): Event Chips or Empty State */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto sm:overflow-hidden flex-1 min-h-[22px] pb-0.5 sm:pb-0">
          {hasIncidents ? (
            // Display incident chips when data exists
            displayIncidents.map((incident) => (
              <button
                key={incident.id}
                onClick={() => setSelectedIncident(incident)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 bg-red-50 border border-red-300 text-red-700 rounded hover:bg-red-100 transition-colors active:scale-[0.95] text-[10px] sm:text-xs font-medium whitespace-nowrap flex-shrink-0"
              >
                <span className="font-bold">[{incident.category}]</span>
                <span className="hidden sm:inline truncate max-w-[150px]">{incident.title}</span>
                <span className="sm:hidden truncate max-w-[100px]">{incident.title}</span>
              </button>
            ))
          ) : (
            // Display empty state message when no data
            <span className="text-[10px] sm:text-xs text-red-600 font-medium italic">
              現在、検出された速報はありません
            </span>
          )}
        </div>

        {/* Count Badge on desktop (right side) */}
        <span className="hidden sm:flex text-[10px] sm:text-xs text-red-700 font-medium flex-shrink-0">
          ({incidents.length}件)
        </span>
      </div>

      {/* Modal */}
      <IncidentModal
        incident={selectedIncident}
        onClose={() => setSelectedIncident(null)}
        onMapClick={handleMapClick}
      />
    </>
  );
});

export default IncidentAlert;
