"use client";

// 「ここトレ！」(APP_MODE === 'photo')専用: 全投稿写真を地図上のピンで一覧できる
// 全画面マップビュー。SpotBase本体(pro)向けの地図(app/page.tsx内のcomponents/Map.tsx)
// とは完全に独立しており、"photo_spots"コレクションのみを参照する。
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { APP_MODE } from "@/lib/config";
import { getAllPhotoSpots } from "@/lib/photoSpots";
import type { PhotoSpot } from "@/lib/types/photoSpot";
import { EMPTY_PHOTO_SPOT_FILTERS, matchesPhotoSpotFilters, type PhotoSpotFilters } from "@/lib/photoSpotFilters";
import PhotoHeaderNav from "@/components/PhotoHeaderNav";
import PhotoBottomNav, { PHOTO_BOTTOM_NAV_SAFE_PADDING_CLASS } from "@/components/PhotoBottomNav";
import PhotoSpotFilterBar from "@/components/PhotoSpotFilterBar";
import PhotoUploadModal from "@/components/PhotoUploadModal";
import AuthModal from "@/components/AuthModal";

// LeafletはSSR非対応なのでクライアント側のみで読み込む
const PhotoSpotsMapView = dynamic(() => import("@/components/PhotoSpotsMapView"), { ssr: false });

export default function PhotoSpotsMapPage() {
  const router = useRouter();
  const { user, photoProfile, loading: authLoading } = useAuth();
  const [spots, setSpots] = useState<PhotoSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<PhotoSpotFilters>(EMPTY_PHOTO_SPOT_FILTERS);
  // 写真をクリックした際に地図をその撮影場所へflyToし、該当ピンを強調表示するためのID
  const [focusedSpotId, setFocusedSpotId] = useState<string | undefined>(undefined);
  const [showPhotoUploadModal, setShowPhotoUploadModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // /map?spot=<id> で遷移してきた場合、そのスポットを初期フォーカスにする。
  // useSearchParams()はSuspense境界が必要になるため、CSRのuseEffectで直接読み取る。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const spotId = new URLSearchParams(window.location.search).get("spot");
    if (spotId) setFocusedSpotId(spotId);
  }, []);

  useEffect(() => {
    // pro向けのURLとしてこのページに来た場合は、本体側のホームへ戻す
    if (APP_MODE !== "photo") {
      router.push("/");
      return;
    }
    if (authLoading) return;
    // 未ログインのゲストでも地図・スポット一覧を閲覧できるようにする

    setLoading(true);
    getAllPhotoSpots()
      .then(setSpots)
      .catch((error) => {
        console.error("ここトレ！: photo_spotsの取得に失敗しました", error);
      })
      .finally(() => setLoading(false));
  }, [authLoading, user, photoProfile, router]);

  const filteredSpots = useMemo(
    () => spots.filter((spot) => matchesPhotoSpotFilters(spot, filters)),
    [spots, filters]
  );

  async function refetchPhotoSpots() {
    const spotsData = await getAllPhotoSpots();
    setSpots(spotsData);
  }

  if (APP_MODE !== "photo") return null;

  return (
    <div className="w-full max-w-full overflow-x-hidden flex flex-col bg-gray-100 h-[100dvh]">
      <div className="app-header relative z-[9999] bg-gradient-to-r from-blue-500 to-indigo-600 flex-shrink-0">
        <PhotoHeaderNav />
      </div>
      <div className={`relative flex-1 min-h-0 box-border ${PHOTO_BOTTOM_NAV_SAFE_PADDING_CLASS}`}>
        {loading ? (
          <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
            読み込み中...
          </div>
        ) : (
          <>
            {/* z-indexはLeafletのコントロール(zoom等、最大z-index:1000)より確実に
                手前に来るよう余裕を持たせる。ズームコントロールはbottomrightに
                配置しているため通常は重ならないが、二重の対策として設定。 */}
            <div className="absolute top-3 left-3 right-3 z-[1100] bg-white/95 backdrop-blur rounded-xl border border-gray-200 shadow-sm px-4 py-3">
              <PhotoSpotFilterBar filters={filters} onChange={setFilters} />
              <p className="text-xs text-gray-400 mt-2">
                {filteredSpots.length}件の撮影スポットを表示中
              </p>
            </div>
            <PhotoSpotsMapView
              spots={filteredSpots}
              focusedSpotId={focusedSpotId}
              onMarkerClick={setFocusedSpotId}
            />
          </>
        )}
      </div>
      <PhotoBottomNav
        onNewPhotoSpot={() => {
          if (!user) {
            setShowAuthModal(true);
            return;
          }
          setShowPhotoUploadModal(true);
        }}
      />
      {showPhotoUploadModal && (
        <PhotoUploadModal
          onClose={() => setShowPhotoUploadModal(false)}
          onCreated={refetchPhotoSpots}
        />
      )}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
}
