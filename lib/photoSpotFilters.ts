// 「ここトレ！」ギャラリー・地図画面共通の絞り込みロジック。
// ギャラリー(PhotoGalleryView)と地図一覧(app/map/page.tsx)の両方から使われる。
import type {
  PhotoSpot,
  PhotoSpotEquipmentTag,
  PhotoSpotSubjectTag,
  PhotoSpotTimeOfDay,
} from "./types/photoSpot";

export type PhotoSpotFilters = {
  timeOfDay: PhotoSpotTimeOfDay[];
  subjectTags: PhotoSpotSubjectTag[];
  equipmentTags: PhotoSpotEquipmentTag[];
};

export const EMPTY_PHOTO_SPOT_FILTERS: PhotoSpotFilters = {
  timeOfDay: [],
  subjectTags: [],
  equipmentTags: [],
};

export function hasActivePhotoSpotFilters(filters: PhotoSpotFilters): boolean {
  return (
    filters.timeOfDay.length > 0 ||
    filters.subjectTags.length > 0 ||
    filters.equipmentTags.length > 0
  );
}

// 各カテゴリ内はOR条件(いずれかに一致)、カテゴリ間はAND条件で絞り込む。
// 例: 時間帯=[夕景,夜景] かつ 被写体=[風景] を選んだ場合、
//     「(夕景 or 夜景) かつ 風景」を満たすスポットのみが対象になる。
export function matchesPhotoSpotFilters(spot: PhotoSpot, filters: PhotoSpotFilters): boolean {
  if (filters.timeOfDay.length > 0) {
    if (!spot.exif?.timeOfDay || !filters.timeOfDay.includes(spot.exif.timeOfDay)) {
      return false;
    }
  }
  if (filters.subjectTags.length > 0) {
    const tags = spot.subjectTags ?? [];
    if (!filters.subjectTags.some((tag) => tags.includes(tag))) return false;
  }
  if (filters.equipmentTags.length > 0) {
    const tags = spot.equipmentTags ?? [];
    if (!filters.equipmentTags.some((tag) => tags.includes(tag))) return false;
  }
  return true;
}
