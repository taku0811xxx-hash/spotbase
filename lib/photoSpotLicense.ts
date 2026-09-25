// 「ここトレ！」専用: 写真の利用条件(ライセンス)をバッジ表示用に整形するユーティリティ。
// ギャラリーカード・詳細ビューの両方から使う。
import type { PhotoSpot, PhotoSpotLicenseType } from "./types/photoSpot";

export type LicenseBadge = {
  label: string;
  className: string; // Tailwindのピル型バッジ用クラス
};

const LICENSE_BADGES: Record<PhotoSpotLicenseType, LicenseBadge> = {
  free: { label: "無料素材", className: "bg-green-100 text-green-800" },
  commercial: { label: "商用利用OK", className: "bg-blue-100 text-blue-800" },
  editorial: { label: "非商用・報道限定", className: "bg-amber-100 text-amber-800" },
  permission_required: { label: "要許可", className: "bg-gray-200 text-gray-700" },
};

// スポットが持つライセンス情報から、表示すべきバッジをすべて返す
// (licenseTypeの区分バッジ + isFree/allowCommercialの実態バッジを、重複なくまとめる)
export function getLicenseBadges(spot: PhotoSpot): LicenseBadge[] {
  const labels = new Set<string>();
  const badges: LicenseBadge[] = [];

  function add(badge: LicenseBadge) {
    if (labels.has(badge.label)) return;
    labels.add(badge.label);
    badges.push(badge);
  }

  if (spot.licenseType) add(LICENSE_BADGES[spot.licenseType]);
  if (spot.isFree) add(LICENSE_BADGES.free);
  if (spot.allowCommercial) add(LICENSE_BADGES.commercial);

  return badges;
}

export function canDownloadFree(spot: PhotoSpot): boolean {
  return spot.isFree === true;
}
