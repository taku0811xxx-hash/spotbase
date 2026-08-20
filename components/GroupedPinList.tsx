"use client";

import { useMemo, memo } from "react";
import type { Pin } from "@/lib/pins";

interface Props {
  pins: Pin[];
  onSelectPin: (pin: Pin) => void;
  loading?: boolean;
}

const GroupedPinList = memo(function GroupedPinList({
  pins,
  onSelectPin,
  loading = false,
}: Props) {
  // parentLocation でグループ化
  const groupedPins = useMemo(() => {
    const groups = new Map<string, Pin[]>();
    pins.forEach((pin) => {
      const location = pin.parentLocation || "その他";
      if (!groups.has(location)) {
        groups.set(location, []);
      }
      groups.get(location)!.push(pin);
    });

    // グループをソート（出動回数で降順）
    return Array.from(groups.entries())
      .sort((a, b) => {
        const countA = a[1].reduce((sum, pin) => sum + (pin.dispatchCount || 0), 0);
        const countB = b[1].reduce((sum, pin) => sum + (pin.dispatchCount || 0), 0);
        return countB - countA;
      })
      .map(([location, pinsInGroup]) => ({
        location,
        pins: pinsInGroup,
        totalDispatchCount: pinsInGroup.reduce((sum, pin) => sum + (pin.dispatchCount || 0), 0),
      }));
  }, [pins]);

  if (loading) {
    return <p className="text-[10px] text-gray-500 px-2">読み込み中...</p>;
  }

  if (pins.length === 0) {
    return <p className="text-[10px] text-gray-500 px-2">該当する現場がありません</p>;
  }

  return (
    <div className="mb-2">
      {groupedPins.map(({ location, pins: groupPins, totalDispatchCount }) => (
        <div key={location}>
          {/* グループ見出し */}
          <div className="sticky top-0 bg-gray-50 border-t border-b border-gray-100 px-2 py-2 z-10">
            <h4 className="text-xs font-semibold text-gray-900">
              🏛️ {location} ({groupPins.length}件
              {totalDispatchCount > 0 && ` / 出動: ${totalDispatchCount}件`})
            </h4>
          </div>

          {/* グループ内のピン */}
          <ul className="space-y-1">
            {groupPins.map((pin) => (
              <li key={pin.id}>
                <button
                  onClick={() => onSelectPin(pin)}
                  className="w-full text-left px-2 py-2 hover:bg-gray-100 rounded transition-colors text-[12px]"
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{pin.name}</p>
                      <p className="text-[11px] text-gray-500 truncate">{pin.address}</p>
                    </div>
                    {pin.dispatchCount && pin.dispatchCount > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded whitespace-nowrap flex-shrink-0">
                        {pin.dispatchCount}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
});

export default GroupedPinList;
