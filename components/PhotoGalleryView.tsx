"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { PhotoSpot } from "@/lib/types/photoSpot";
import { distanceMeters } from "@/lib/userPathHistory";
import PhotoSpotFilterBar from "@/components/PhotoSpotFilterBar";
import { EMPTY_PHOTO_SPOT_FILTERS, matchesPhotoSpotFilters, type PhotoSpotFilters } from "@/lib/photoSpotFilters";
import LikeSaveButtons from "@/components/LikeSaveButtons";
import { getLicenseBadges, canDownloadFree } from "@/lib/photoSpotLicense";
import { Download } from "lucide-react";

// LeafletはSSR非対応なのでクライアント側のみで読み込む。
// pro向けのcomponents/Map.tsxとは別の、photoSpot専用の軽量な地図コンポーネント。
const PhotoSpotMap = dynamic(() => import("@/components/PhotoSpotMap"), { ssr: false });

// 周辺スポットとみなす距離(m)。SpotBase本体のpinSync統合ロジック(300m)より
// 狭め: ギャラリーの「近くの撮影スポット」は徒歩圏の近接候補を想定しているため。
const NEARBY_RADIUS_METERS = 1500;

type PhotoItem = {
  spot: PhotoSpot;
  url: string;
};

type Props = {
  spots: PhotoSpot[];
  loading: boolean;
  // 地図一覧ページのポップアップ「詳細を見る」から遷移してきた場合に、
  // 該当スポットを最初から選択状態(2カラム詳細ビュー)にするためのID
  initialSpotId?: string;
};

// 写真1件分に紐づく撮影メタデータを、キャプション用の短い文字列配列に整形する。
function buildExifLines(spot: PhotoSpot): string[] {
  const { cameraGear, exif } = spot;
  const lines: string[] = [];
  if (cameraGear?.camera) lines.push(`カメラ: ${cameraGear.camera}`);
  if (cameraGear?.lens) lines.push(`レンズ: ${cameraGear.lens}`);
  const settings = [
    exif?.fNumber != null ? `F${exif.fNumber}` : null,
    exif?.exposureTime ? `SS ${exif.exposureTime}` : null,
    exif?.iso != null ? `ISO ${exif.iso}` : null,
    exif?.focalLength ? exif.focalLength : null,
  ].filter(Boolean);
  if (settings.length > 0) lines.push(`設定: ${settings.join(" / ")}`);
  if (exif?.timeOfDay) lines.push(`撮影時間帯: ${exif.timeOfDay}`);
  return lines;
}

export default function PhotoGalleryView({ spots, loading, initialSpotId }: Props) {
  const [selected, setSelected] = useState<PhotoItem | null>(null);
  const [filters, setFilters] = useState<PhotoSpotFilters>(EMPTY_PHOTO_SPOT_FILTERS);

  // 絞り込み条件に合うスポットのみを対象にする
  const filteredSpots = useMemo(
    () => spots.filter((spot) => matchesPhotoSpotFilters(spot, filters)),
    [spots, filters]
  );

  // 各スポットが持つ写真ギャラリーを、すべて1枚ずつのギャラリー項目に展開する
  const photoItems = useMemo<PhotoItem[]>(() => {
    const items: PhotoItem[] = [];
    for (const spot of filteredSpots) {
      for (const url of spot.photoUrls ?? []) {
        items.push({ spot, url });
      }
    }
    return items;
  }, [filteredSpots]);

  // 地図一覧ページから「詳細を見る」で遷移してきた場合、該当スポットを自動選択する
  useEffect(() => {
    if (!initialSpotId || selected) return;
    const spot = spots.find((s) => s.id === initialSpotId);
    const url = spot?.photoUrls?.[0];
    if (spot && url) setSelected({ spot, url });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSpotId, spots]);

  const nearbyItems = useMemo<PhotoItem[]>(() => {
    if (!selected) return [];
    return photoItems.filter((item) => {
      if (item.url === selected.url) return false;
      return (
        distanceMeters(
          { lat: selected.spot.lat, lng: selected.spot.lng },
          { lat: item.spot.lat, lng: item.spot.lng }
        ) <= NEARBY_RADIUS_METERS
      );
    });
  }, [photoItems, selected]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
        読み込み中...
      </div>
    );
  }

  if (spots.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
        投稿された写真がまだありません
      </div>
    );
  }

  // 未選択時: 絞り込みバー + 写真一覧(ギャラリー)をメインエリアに表示
  if (!selected) {
    return (
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mb-4 pb-4 border-b border-gray-200">
          <PhotoSpotFilterBar filters={filters} onChange={setFilters} />
        </div>
        {photoItems.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">
            条件に一致する写真が見つかりませんでした
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {photoItems.map((item, i) => (
              // カード内部にLikeSaveButtonsの<button>を含むため、外枠は<button>ではなく
              // role="button"を持つ<div>にする(HTML仕様上<button>は<button>を子に持てず、
              // これを破ると「In HTML, <button> cannot be a descendant of <button>」という
              // ハイドレーションエラーになる)
              <div
                key={`${item.spot.id}-${i}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(item);
                  }
                }}
                className="relative aspect-square rounded-lg overflow-hidden bg-gray-200 group cursor-pointer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={item.spot.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                />
                {getLicenseBadges(item.spot).length > 0 && (
                  <div className="absolute top-1.5 left-1.5 flex flex-wrap gap-1">
                    {getLicenseBadges(item.spot).map((badge) => (
                      <span
                        key={badge.label}
                        className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    ))}
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 pt-4 pb-1.5 flex items-end justify-between">
                  <span className="text-white text-xs text-left truncate opacity-0 group-hover:opacity-100 transition-opacity">
                    {item.spot.name}
                  </span>
                  <div className="bg-black/30 rounded-full backdrop-blur-sm">
                    <LikeSaveButtons spotId={item.spot.id} url={item.url} size="sm" stopPropagation />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 写真選択時: 左(拡大写真+詳細+周辺スポット) / 右(地図) の2カラムビュー
  const exifLines = buildExifLines(selected.spot);

  return (
    <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-3 p-3 sm:p-4 overflow-hidden">
      {/* 左側エリア */}
      <div className="flex-1 md:w-1/2 min-h-0 overflow-y-auto flex flex-col gap-4">
        <button
          onClick={() => setSelected(null)}
          className="self-start text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1"
        >
          ← 一覧に戻る
        </button>

        {/* 1. メイン写真の拡大表示(写真そのものを主役にするため、最も大きく最優先で表示) */}
        <div className="rounded-xl overflow-hidden bg-black flex-shrink-0 shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selected.url}
            alt={selected.spot.name}
            className="w-full max-h-[68vh] object-contain bg-black"
          />
        </div>

        {/* 2. 撮影詳細情報(場所名はあくまで写真に添える補足情報として控えめに表示) */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 flex-shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-gray-400">{selected.spot.address}</p>
              <h2 className="text-sm font-medium text-gray-700">{selected.spot.name}</h2>
            </div>
            <LikeSaveButtons spotId={selected.spot.id} url={selected.url} size="md" />
          </div>

          {getLicenseBadges(selected.spot).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {getLicenseBadges(selected.spot).map((badge) => (
                <span
                  key={badge.label}
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badge.className}`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          )}

          {canDownloadFree(selected.spot) && (
            <a
              href={selected.spot.downloadUrl ?? selected.url}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors rounded-lg px-3 py-1.5"
            >
              <Download size={14} strokeWidth={2.5} />
              無料ダウンロード
            </a>
          )}

          {selected.spot.description && (
            <p className="text-sm text-gray-500">{selected.spot.description}</p>
          )}
          {exifLines.length > 0 && (
            <ul className="text-xs text-gray-500 space-y-0.5 pt-1 border-t border-gray-100">
              {exifLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          {(selected.spot.subjectTags?.length || selected.spot.equipmentTags?.length) && (
            <div className="flex flex-wrap gap-1 pt-1">
              {[...(selected.spot.subjectTags ?? []), ...(selected.spot.equipmentTags ?? [])].map((tag) => (
                <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                  {tag}
                </span>
              ))}
            </div>
          )}
          {selected.spot.accessNote && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5 mt-2">
              撮影アドバイス: {selected.spot.accessNote}
            </p>
          )}
        </div>

        {/* 🚗 周辺の駐車場・アクセス */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex-shrink-0">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">🚗 周辺の駐車場・アクセス</h3>
          {selected.spot.parkingLots && selected.spot.parkingLots.length > 0 ? (
            <ul className="space-y-2">
              {selected.spot.parkingLots.map((lot, i) => (
                <li key={`${lot.name}-${i}`} className="border border-gray-100 rounded-lg px-3 py-2 bg-gray-50">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-800">{lot.name}</p>
                    {lot.isCoinParking && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 flex-shrink-0">
                        コインパーキング
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {lot.distance}
                    {lot.capacity && ` ・ ${lot.capacity}`}
                  </p>
                  {lot.note && <p className="text-xs text-amber-700 mt-1">⚠ {lot.note}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-gray-400 space-y-1">
              <p>※周辺のコインパーキングをご利用ください</p>
              <a
                href={`https://www.google.com/maps/search/駐車場/@${selected.spot.lat},${selected.spot.lng},16z`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-orange-600 hover:text-orange-700 font-medium"
              >
                Google Mapsで周辺の駐車場を検索 →
              </a>
            </div>
          )}
        </div>

        {/* 3. 周辺の撮影スポット・写真 */}
        <div className="flex-shrink-0">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">周辺の撮影スポット</h3>
          {nearbyItems.length === 0 ? (
            <p className="text-xs text-gray-400">周辺に他の撮影スポットは見つかりませんでした</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {nearbyItems.map((item, i) => (
                <button
                  key={`${item.spot.id}-nearby-${i}`}
                  onClick={() => setSelected(item)}
                  className="relative flex-shrink-0 w-28 h-28 rounded-lg overflow-hidden bg-gray-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt={item.spot.name} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 右側エリア: 選択した写真の撮影場所にフォーカスした地図 */}
      <div className="flex-1 md:w-1/2 min-h-[300px] rounded-xl overflow-hidden border border-gray-200">
        <PhotoSpotMap spot={selected.spot} />
      </div>
    </div>
  );
}
