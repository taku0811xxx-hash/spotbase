"use client";

import { useMemo, memo } from "react";
import type { Pin } from "@/lib/pins";

interface Props {
  pins: Pin[];
  selectedFilter: string | null;
  onFilterChange: (parentLocation: string | null) => void;
}

const QuickLocationFilter = memo(function QuickLocationFilter({
  pins,
  selectedFilter,
  onFilterChange,
}: Props) {
  // ユニークな parentLocation を集計
  const uniqueLocations = useMemo(() => {
    const locations = new Map<string, number>();
    pins.forEach((pin) => {
      const location = pin.parentLocation || "その他";
      locations.set(location, (locations.get(location) || 0) + 1);
    });
    return Array.from(locations.entries()).sort((a, b) => b[1] - a[1]);
  }, [pins]);

  if (uniqueLocations.length === 0) {
    return null;
  }

  return (
    <div className="shrink-0 w-full bg-white border-b border-gray-100 box-border overflow-x-auto">
      <div className="flex items-center gap-2 px-3 py-2 whitespace-nowrap">
        {/* すべてフィルター */}
        <button
          onClick={() => onFilterChange(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex-shrink-0 ${
            selectedFilter === null
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          すべて
        </button>

        {/* 建物・地名フィルター */}
        {uniqueLocations.map(([location, count]) => (
          <button
            key={location}
            onClick={() => onFilterChange(location)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex-shrink-0 ${
              selectedFilter === location
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {location} ({count})
          </button>
        ))}
      </div>
    </div>
  );
});

export default QuickLocationFilter;
