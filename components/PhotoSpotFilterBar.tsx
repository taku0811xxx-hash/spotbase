"use client";

// 「ここトレ！」のギャラリー・地図一覧共通の絞り込みバー。
// 時間帯・被写体タグ・機材タグをチップで複数選択でき、選択状態は呼び出し元(state)で
// 保持する(このコンポーネント自体は表示専用のcontrolled component)。
//
// 上段に「絞り込み条件🔍」ラベルを固定表示し、下段の条件ボタン群のみを
// 横スクロール1行に収める(overflow-x-auto + whitespace-nowrap + 各チップshrink-0)。
// グループ間はセパレータのみで区切り、グループごとの改行は作らない。
import {
  PHOTO_SPOT_EQUIPMENT_TAGS,
  PHOTO_SPOT_SUBJECT_TAGS,
} from "@/lib/types/photoSpot";
import type {
  PhotoSpotEquipmentTag,
  PhotoSpotSubjectTag,
  PhotoSpotTimeOfDay,
} from "@/lib/types/photoSpot";
import { EMPTY_PHOTO_SPOT_FILTERS, hasActivePhotoSpotFilters, type PhotoSpotFilters } from "@/lib/photoSpotFilters";

const TIME_OF_DAY_OPTIONS: PhotoSpotTimeOfDay[] = ["早朝", "昼", "夕景", "夜景"];

type Props = {
  filters: PhotoSpotFilters;
  onChange: (filters: PhotoSpotFilters) => void;
  // 地図画面では常時オーバーレイ表示のためやや詰めたスタイルにしたい、等の見た目調整用
  className?: string;
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function FilterChip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color: "orange" | "pink" | "indigo";
  onClick: () => void;
}) {
  const activeClass = {
    orange: "bg-orange-500 border-orange-500 text-white",
    pink: "bg-pink-500 border-pink-500 text-white",
    indigo: "bg-indigo-500 border-indigo-500 text-white",
  }[color];

  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-2 rounded-full text-xs font-medium border whitespace-nowrap transition-colors ${
        active ? activeClass : "border-gray-300 text-gray-600 bg-white hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}

export default function PhotoSpotFilterBar({ filters, onChange, className = "" }: Props) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {/* 上段: ラベルは固定表示(スクロールしない) */}
      <div className="flex items-center gap-1 text-xs font-semibold text-gray-600">
        <span>絞り込み条件</span>
        <span>🔍</span>
      </div>

      {/* 下段: 条件ボタン群のみを横スクロール */}
      <div className="flex items-center gap-2 py-2 min-h-12 overflow-x-auto whitespace-nowrap">
        {TIME_OF_DAY_OPTIONS.map((opt) => (
          <FilterChip
            key={opt}
            label={opt}
            active={filters.timeOfDay.includes(opt)}
            color="orange"
            onClick={() => onChange({ ...filters, timeOfDay: toggle(filters.timeOfDay, opt) })}
          />
        ))}

        <span className="shrink-0 w-px h-4 bg-gray-200 mx-0.5" />

        {PHOTO_SPOT_SUBJECT_TAGS.map((opt: PhotoSpotSubjectTag) => (
          <FilterChip
            key={opt}
            label={opt}
            active={filters.subjectTags.includes(opt)}
            color="pink"
            onClick={() => onChange({ ...filters, subjectTags: toggle(filters.subjectTags, opt) })}
          />
        ))}

        <span className="shrink-0 w-px h-4 bg-gray-200 mx-0.5" />

        {PHOTO_SPOT_EQUIPMENT_TAGS.map((opt: PhotoSpotEquipmentTag) => (
          <FilterChip
            key={opt}
            label={opt}
            active={filters.equipmentTags.includes(opt)}
            color="indigo"
            onClick={() => onChange({ ...filters, equipmentTags: toggle(filters.equipmentTags, opt) })}
          />
        ))}

        {hasActivePhotoSpotFilters(filters) && (
          <button
            onClick={() => onChange(EMPTY_PHOTO_SPOT_FILTERS)}
            className="shrink-0 whitespace-nowrap text-xs text-gray-400 hover:text-gray-700 underline ml-1"
          >
            リセット
          </button>
        )}
      </div>
    </div>
  );
}
