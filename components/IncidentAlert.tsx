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

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 sm:p-4">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Header */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-lg sm:text-2xl animate-pulse">🚨</span>
            <span className="font-bold text-gray-900 text-sm sm:text-base whitespace-nowrap">
              もしかして今起きてる？
            </span>
          </div>

          {/* Event Chips */}
          <div className="flex items-center gap-2 flex-wrap">
            {incidents.map((incident) => (
              <button
                key={incident.id}
                onClick={() => setSelectedIncident(incident)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-300 text-red-700 rounded-lg hover:bg-red-100 hover:border-red-400 transition-colors active:scale-[0.95] text-xs sm:text-sm font-medium whitespace-nowrap"
              >
                <span>[{incident.category}]</span>
                <span className="truncate max-w-[200px]">{incident.title}</span>
              </button>
            ))}
          </div>

          {/* Count Badge */}
          <span className="text-xs sm:text-sm text-gray-500 ml-auto flex-shrink-0">
            ({incidents.length}件)
          </span>
        </div>
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
