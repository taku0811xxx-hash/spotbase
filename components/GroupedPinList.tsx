"use client";

import { useMemo, memo } from "react";
import type { Pin } from "@/lib/pins";

interface Props {
  pins: Pin[];
  onSelectPin: (pin: Pin) => void;
  onOpenDetail?: (pin: Pin) => void; // 「開く」ボタン押下時: 現場詳細パネルを開く
  selectedPinId?: string | null; // 選択中の現場ID（「開く」ボタンの表示制御に使用）
  loading?: boolean;
}

// ピンの parentLocation を取得（フォールバック処理付き）
function getParentLocation(pin: Pin): string {
  if (pin.parentLocation) {
    return pin.parentLocation;
  }

  // parentLocation が空の場合、name から自動抽出
  // スペース区切りの最初の単語を抽出
  const nameParts = pin.name.trim().split(/\s+/);
  if (nameParts.length > 0 && nameParts[0].length > 0) {
    return nameParts[0];
  }

  return "その他";
}

// pin.name から parentLocation の重複を除去
function getDisplayName(pin: Pin): string {
  const parentLocation = getParentLocation(pin);
  const name = pin.name.trim();

  // parentLocation が name の先頭に含まれている場合は削除
  if (name.startsWith(parentLocation)) {
    return name.substring(parentLocation.length).trim();
  }

  return name;
}

const GroupedPinList = memo(function GroupedPinList({
  pins,
  onSelectPin,
  onOpenDetail,
  selectedPinId = null,
  loading = false,
}: Props) {
  // parentLocation でグループ化
  const groupedPins = useMemo(() => {
    const groups = new Map<string, Pin[]>();
    pins.forEach((pin) => {
      const location = getParentLocation(pin);
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
          <div className="sticky top-0 bg-slate-700 text-white px-3 py-2.5 z-10 rounded-t-md border-l-4 border-blue-500">
            <h4 className="text-xs font-bold flex items-center justify-between">
              <span>🏛️ {location}</span>
              <span className="text-[11px] font-semibold ml-2">
                {groupPins.length}件
                {totalDispatchCount > 0 && ` / 出動: ${totalDispatchCount}件`}
              </span>
            </h4>
          </div>

          {/* グループ内のピン（階層構造を表示） */}
          <div className="border-l-2 border-slate-300 pl-3 bg-slate-50">
            <ul className="space-y-1 py-1">
              {groupPins.map((pin) => {
                const isSelected = selectedPinId === pin.id;
                return (
                  <li key={pin.id}>
                    {/* 現場名エリアと「開く」ボタンは兄弟要素として配置
                        （button要素の入れ子はHTML仕様違反かつアクセシビリティ上の問題があるため） */}
                    <div
                      className={`w-full flex items-center gap-1 rounded transition-colors ${
                        isSelected ? "bg-blue-50 ring-1 ring-blue-300" : "bg-white hover:bg-white hover:shadow-sm"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectPin(pin)}
                        aria-pressed={isSelected}
                        className="flex-1 min-w-0 text-left px-2 py-2 rounded transition-colors text-[12px]"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">{getDisplayName(pin)}</p>
                            <p className="text-[11px] text-gray-500 truncate">{pin.address}</p>
                          </div>
                          {pin.dispatchCount && pin.dispatchCount > 0 && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-blue-600 text-white rounded whitespace-nowrap flex-shrink-0 font-semibold">
                              {pin.dispatchCount}
                            </span>
                          )}
                        </div>
                      </button>

                      {/* 選択中の現場アイテムにのみ「開く」ボタンを表示する。
                          未選択の場合は表示しない（誤操作防止） */}
                      {isSelected && onOpenDetail && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenDetail(pin);
                          }}
                          className="flex-shrink-0 mr-1.5 flex items-center gap-0.5 text-[11px] font-semibold text-white bg-blue-600 rounded px-2 py-1.5 hover:bg-blue-700 active:scale-[0.97] transition-all duration-150"
                          aria-label={`${getDisplayName(pin)}の詳細を開く`}
                        >
                          開く
                          <span aria-hidden="true">→</span>
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
});

export default GroupedPinList;
