"use client";

import { useState } from "react";
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

export default function IncidentAlert({ incidents, onMapNavigate }: Props) {
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  if (incidents.length === 0) {
    return null;
  }

  const handleMapClick = () => {
    if (selectedIncident && selectedIncident.latitude && selectedIncident.longitude) {
      onMapNavigate?.(selectedIncident.latitude, selectedIncident.longitude);
    }
  };

  // 最初の数件のみ表示（スペース節約）
  const displayIncidents = incidents.slice(0, 3);

  return (
    <>
      {/* Slim Single-Line Banner */}
      <div className="bg-gradient-to-r from-red-100 to-orange-100 border border-red-300 px-3 py-2 sm:px-4 sm:py-2.5 flex items-center gap-2 sm:gap-3 overflow-x-auto">
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-lg sm:text-xl animate-pulse">🚨</span>
          <span className="font-bold text-red-900 text-xs sm:text-sm whitespace-nowrap">
            もしかして今起きてる？
          </span>
        </div>

        {/* Event Chips (Scrollable on mobile) */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 flex-1">
          {displayIncidents.map((incident) => (
            <button
              key={incident.id}
              onClick={() => setSelectedIncident(incident)}
              className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 border border-red-300 text-red-700 rounded hover:bg-red-100 transition-colors active:scale-[0.95] text-[10px] sm:text-xs font-medium whitespace-nowrap flex-shrink-0"
            >
              <span>[{incident.category}]</span>
              <span className="hidden sm:inline truncate max-w-[150px]">{incident.title}</span>
              <span className="sm:hidden truncate max-w-[80px]">{incident.title.slice(0, 5)}...</span>
            </button>
          ))}
        </div>

        {/* Count Badge */}
        <span className="text-[10px] sm:text-xs text-red-700 font-medium flex-shrink-0">
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
}
