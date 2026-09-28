"use client";

// 「ここトレ！」撮影準備タブ専用: 保存済み(ブックマーク)スポットの一覧を表示し、
// 「Googleマップでナビ起動」や、推奨レンズ・駐車場情報の再確認へすぐアクセスできる
// ようにする「場所決め」パネル。一覧から選ぶと「環境」タブへそのスポットを引き渡す。
import { useEffect, useMemo, useState } from "react";
import { getSpotTitle } from "@/lib/spotTitle";
import { MapPin, Navigation2 } from "lucide-react";
import { useSavedPhotoKeys } from "@/lib/hooks/usePhotoInteractions";
import { getAllPhotoSpots, getPhotoSpotPhotos } from "@/lib/photoSpots";
import type { PhotoSpot } from "@/lib/types/photoSpot";

type Props = {
  onSelectSpot: (spot: PhotoSpot) => void;
};

export default function SpotPlanner({ onSelectSpot }: Props) {
  const savedKeys = useSavedPhotoKeys();
  const [allSpots, setAllSpots] = useState<PhotoSpot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllPhotoSpots()
      .then(setAllSpots)
      .catch((error) => console.error("ここトレ！: photo_spotsの取得に失敗しました", error))
      .finally(() => setLoading(false));
  }, []);

  const savedSpotIds = useMemo(() => new Set(savedKeys.map((k) => k.split(":")[0])), [savedKeys]);
  const savedSpots = useMemo(() => allSpots.filter((s) => savedSpotIds.has(s.id)), [allSpots, savedSpotIds]);

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-8">読み込み中...</p>;
  }

  if (savedSpots.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        保存したスポットはまだありません。写真の🔖ボタンから保存できます。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {savedSpots.map((spot) => {
        const photos = getPhotoSpotPhotos(spot);
        const primary = photos[0];
        const recommendedLens = primary?.cameraGear?.lens;
        const nearbyInfo = primary?.otherInfo || primary?.parkingInfo;
        const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`;

        return (
          <div key={spot.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => onSelectSpot(spot)}
              className="w-full flex gap-3 p-3 text-left hover:bg-gray-50"
            >
              {spot.photoUrls[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={spot.photoUrls[0]} alt={getSpotTitle(spot)} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{getSpotTitle(spot)}</p>
                <p className="text-xs text-gray-400 truncate">{spot.address}</p>
                {recommendedLens && (
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">推奨レンズ: {recommendedLens}</p>
                )}
                {nearbyInfo && <p className="text-[11px] text-gray-500 truncate">周辺情報: {nearbyInfo}</p>}
              </div>
            </button>
            <div className="flex border-t border-gray-100">
              <a
                href={navUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-orange-600 hover:bg-orange-50"
              >
                <Navigation2 size={13} strokeWidth={2} />
                Googleマップでナビ
              </a>
              <button
                onClick={() => onSelectSpot(spot)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 border-l border-gray-100"
              >
                <MapPin size={13} strokeWidth={2} />
                日照・方角を確認
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
