"use client";

// 「ここトレ！」のギャラリー・地図一覧共通の絞り込みバー。
// 時間帯・被写体タグ・機材タグをチップで複数選択でき、選択状態は呼び出し元(state)で
// 保持する(このコンポーネント自体は表示専用のcontrolled component)。
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

function FilterChipGroup<T extends string>({
  label,
  options,
  selected,
  color,
  onToggle,
}: {
  label: string;
  options: readonly T[];
  selected: T[];
  color: "orange" | "pink" | "indigo";
  onToggle: (value: T) => void;
}) {
  const activeClass = {
    orange: "bg-orange-500 border-orange-500 text-white",
    pink: "bg-pink-500 border-pink-500 text-white",
    indigo: "bg-indigo-500 border-indigo-500 text-white",
  }[color];

  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 mb-1">{label}</p>
      <div className="flex gap-1.5 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onToggle(opt)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              selected.includes(opt) ? activeClass : "border-gray-300 text-gray-600 bg-white hover:bg-gray-50"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PhotoSpotFilterBar({ filters, onChange, className = "" }: Props) {
  return (
    <div className={`flex flex-wrap gap-4 items-start ${className}`}>
      <FilterChipGroup
        label="時間帯"
        options={TIME_OF_DAY_OPTIONS}
        selected={filters.timeOfDay}
        color="orange"
        onToggle={(v) => onChange({ ...filters, timeOfDay: toggle(filters.timeOfDay, v) })}
      />
      <FilterChipGroup
        label="被写体・タグ"
        options={PHOTO_SPOT_SUBJECT_TAGS}
        selected={filters.subjectTags}
        color="pink"
        onToggle={(v: PhotoSpotSubjectTag) =>
          onChange({ ...filters, subjectTags: toggle(filters.subjectTags, v) })
        }
      />
      <FilterChipGroup
        label="機材・撮影条件"
        options={PHOTO_SPOT_EQUIPMENT_TAGS}
        selected={filters.equipmentTags}
        color="indigo"
        onToggle={(v: PhotoSpotEquipmentTag) =>
          onChange({ ...filters, equipmentTags: toggle(filters.equipmentTags, v) })
        }
      />
      {hasActivePhotoSpotFilters(filters) && (
        <button
          onClick={() => onChange(EMPTY_PHOTO_SPOT_FILTERS)}
          className="self-end text-xs text-gray-400 hover:text-gray-700 underline ml-1"
        >
          絞り込みをリセット
        </button>
      )}
    </div>
  );
}
