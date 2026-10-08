"use client";

// 「ここトレ！」(APP_MODE === 'photo')専用: マイページ。
// 自分の投稿(撮影履歴アルバム)・保存したスポット(ブックマーク)・撮影傾向に基づく
// おすすめスポット提案を表示する。"photo_spots"コレクションのみを参照し、
// pro向けのlib/pins.tsには一切依存しない。
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Lock, MessageSquarePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { logout } from "@/lib/auth";
import { APP_MODE } from "@/lib/config";
import { getAllPhotoSpots, getPhotoSpotPhotos } from "@/lib/photoSpots";
import type { PhotoSpot, PhotoSpotPhotoItem } from "@/lib/types/photoSpot";
import { getSpotTitle } from "@/lib/spotTitle";
import { useSavedPhotoKeys } from "@/lib/hooks/usePhotoInteractions";
import { usePhotoProfile } from "@/lib/hooks/usePhotoProfile";
import { buildPhotoSpotRecommendations, mostUsedCamera } from "@/lib/photoSpotRecommendations";
import PhotoHeaderNav from "@/components/PhotoHeaderNav";
import PhotoBottomNav, { PHOTO_BOTTOM_NAV_SAFE_PADDING_CLASS } from "@/components/PhotoBottomNav";
import PhotoUploadModal from "@/components/PhotoUploadModal";
import PhotoSpotDetailModal from "@/components/PhotoSpotDetailModal";
import LikeSaveButtons from "@/components/LikeSaveButtons";
import AuthModal from "@/components/AuthModal";
import ProfileEditModal from "@/components/ProfileEditModal";
import QuickMemoList from "@/components/QuickMemoList";
import FeedbackModal from "@/components/FeedbackModal";

// LeafletはSSR非対応なのでクライアント側のみで読み込む
const PhotoSpotsMapView = dynamic(() => import("@/components/PhotoSpotsMapView"), { ssr: false });

export default function MyPage() {
  const router = useRouter();
  const { user, photoProfile, loading: authLoading } = useAuth();
  const savedKeys = useSavedPhotoKeys();

  const [spots, setSpots] = useState<PhotoSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"posts" | "saved" | "map" | "memo">("posts");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileEditModal, setShowProfileEditModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showPhotoUploadModal, setShowPhotoUploadModal] = useState(false);
  const [photoUploadInitialFiles, setPhotoUploadInitialFiles] = useState<File[]>([]);
  // 撮影アルバムでタップされた写真1枚(と、それが属するスポット)。
  // 同じスポットに複数枚投稿されていても、詳細はタップされたその1枚を中心に表示する。
  const [selectedPhoto, setSelectedPhoto] = useState<{ spot: PhotoSpot; photo: PhotoSpotPhotoItem } | null>(null);
  const { displayName, avatarDataUrl, setAvatarFile } = usePhotoProfile(
    photoProfile?.displayName ?? "ゲスト",
    photoProfile?.photoURL
  );
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  async function handleAvatarFileSelected(file: File) {
    setUploadingAvatar(true);
    try {
      await setAvatarFile(file);
    } finally {
      setUploadingAvatar(false);
    }
  }

  useEffect(() => {
    if (APP_MODE !== "photo") {
      router.push("/");
      return;
    }
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (!photoProfile) return;

    setLoading(true);
    getAllPhotoSpots()
      .then(setSpots)
      .catch((error) => {
        console.error("ここトレ！: photo_spotsの取得に失敗しました", error);
      })
      .finally(() => setLoading(false));
  }, [authLoading, user, photoProfile, router]);

  // 自分の投稿(postedByが自分のuidと一致するもの)
  const myPosts = useMemo(
    () => (photoProfile ? spots.filter((s) => s.postedBy === photoProfile.uid) : []),
    [spots, photoProfile]
  );

  const savedSpotIds = useMemo(() => new Set(savedKeys.map((k) => k.split(":")[0])), [savedKeys]);
  const savedSpots = useMemo(() => spots.filter((s) => savedSpotIds.has(s.id)), [spots, savedSpotIds]);

  const recommendation = useMemo(() => buildPhotoSpotRecommendations(myPosts, spots), [myPosts, spots]);
  const favoriteCamera = useMemo(() => mostUsedCamera(myPosts), [myPosts]);

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  async function refetchPhotoSpots() {
    const spotsData = await getAllPhotoSpots();
    setSpots(spotsData);
  }

  if (APP_MODE !== "photo") return null;

  return (
    <div className="w-full max-w-full overflow-x-hidden flex flex-col bg-gray-100 min-h-[100dvh]">
      <div className="app-header relative z-[9999] bg-gradient-to-r from-blue-500 to-indigo-600 flex-shrink-0">
        <PhotoHeaderNav />
      </div>

      <div className={`flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 space-y-5 ${PHOTO_BOTTOM_NAV_SAFE_PADDING_CLASS}`}>
        {/* プロフィールヘッダー */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
          {/* アイコンをタップ/クリックすると直接ファイル選択が開き、その場で画像を変更できる。
              ホバー/タップ時にカメラアイコンのオーバーレイを重ねて編集可能であることを示す。 */}
          <button
            onClick={() => avatarFileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="group relative w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 overflow-hidden"
            aria-label="アイコン画像を変更"
          >
            {avatarDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarDataUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              displayName.charAt(0) || "?"
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 active:opacity-100 active:bg-black/40 transition-all">
              <span className="text-sm">{uploadingAvatar ? "..." : "📷"}</span>
            </div>
          </button>
          <input
            ref={avatarFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleAvatarFileSelected(file);
              e.target.value = "";
            }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-gray-900 truncate">{displayName}</h1>
              <button
                onClick={() => avatarFileInputRef.current?.click()}
                className="text-[10px] font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 rounded-full px-2 py-0.5 flex-shrink-0"
              >
                アイコンを変更
              </button>
              <button
                onClick={() => setShowProfileEditModal(true)}
                className="text-[10px] font-semibold text-orange-600 hover:text-orange-700 border border-orange-200 rounded-full px-2 py-0.5 flex-shrink-0"
              >
                編集
              </button>
              <button
                onClick={handleLogout}
                className="text-[10px] font-semibold text-gray-400 hover:text-gray-600 border border-gray-200 rounded-full px-2 py-0.5 flex-shrink-0"
              >
                ログアウト
              </button>
            </div>
            <div className="flex gap-4 mt-1 text-xs text-gray-500">
              <span>
                投稿数 <b className="text-gray-800">{myPosts.length}</b>
              </span>
              <span>
                保存済み <b className="text-gray-800">{savedSpots.length}</b>
              </span>
            </div>
            {favoriteCamera && (
              <p className="text-xs text-gray-400 mt-1">よく使う愛機: {favoriteCamera}</p>
            )}
          </div>
        </div>

        {/* ✨ 撮影履歴に基づくおすすめ提案 */}
        {recommendation && (
          <div className="bg-gradient-to-br from-orange-50 to-pink-50 border border-orange-100 rounded-2xl p-5">
            <h2 className="text-sm font-bold text-gray-800 mb-1">✨ あなたの撮影履歴からのおすすめ提案</h2>
            <p className="text-xs text-gray-600 mb-3">{recommendation.message}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {recommendation.spots.map((spot) => (
                <div key={spot.id} className="bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm">
                  {spot.photoUrls[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={spot.photoUrls[0]} alt={getSpotTitle(spot)} className="w-full h-24 object-cover" />
                  )}
                  <div className="p-2">
                    <p className="text-xs font-semibold text-gray-800 truncate">{getSpotTitle(spot)}</p>
                    <p className="text-[10px] text-gray-400 truncate">{spot.address}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* タブ切替 */}
        <div className="flex border-b border-gray-200">
          {([
            ["posts", "撮影\nアルバム"],
            ["saved", "保存した\nスポット"],
            ["map", "マイ撮影\nmap"],
            ["memo", "周辺メモ"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 px-1 py-2 text-xs leading-tight font-semibold whitespace-pre-line text-center border-b-2 transition-colors ${
                tab === key ? "border-orange-500 text-orange-600" : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 text-center py-10">読み込み中...</p>
        ) : tab === "memo" ? (
          <QuickMemoList />
        ) : tab === "posts" ? (
          myPosts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">まだ投稿がありません</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {myPosts.flatMap((spot) =>
                getPhotoSpotPhotos(spot).map((photo, i) => (
                  <button
                    key={`${spot.id}-${i}`}
                    onClick={() => setSelectedPhoto({ spot, photo })}
                    className="relative aspect-square rounded-lg overflow-hidden"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt={photo.locationName || getSpotTitle(spot)} className="w-full h-full object-cover" />
                    {spot.visibility === "private" && (
                      <div
                        className="absolute top-1 left-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center"
                        title="自分のみ(非公開)"
                      >
                        <Lock size={11} strokeWidth={2} />
                      </div>
                    )}
                    <div className="absolute bottom-1 right-1">
                      <LikeSaveButtons spotId={spot.id} url={photo.url} size="sm" stopPropagation />
                    </div>
                  </button>
                ))
              )}
            </div>
          )
        ) : tab === "saved" ? (
          !user ? (
            <div className="text-center py-10 space-y-3">
              <p className="text-sm text-gray-500">
                「保存したスポット」を見るには、会員登録・ログインが必要です
              </p>
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-sm hover:shadow-md"
              >
                無料登録する
              </button>
            </div>
          ) : savedSpots.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">
              保存したスポットはまだありません。写真の🔖ボタンから保存できます。
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {savedSpots.map((spot) => (
                <div key={spot.id} className="bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm">
                  {spot.photoUrls[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={spot.photoUrls[0]} alt={getSpotTitle(spot)} className="w-full h-28 object-cover" />
                  )}
                  <div className="p-2">
                    <p className="text-xs font-semibold text-gray-800 truncate">{getSpotTitle(spot)}</p>
                    <p className="text-[10px] text-gray-400 truncate">{spot.address}</p>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : myPosts.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">
            まだ撮影スポットがありません。写真を投稿すると、ここに地図が表示されます。
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">
              🎉 これまでに <b className="text-gray-800">{new Set(myPosts.map((s) => s.id)).size}</b>{" "}
              つのスポットで撮影しました
            </p>
            <div className="h-96 rounded-xl overflow-hidden border border-gray-200">
              <PhotoSpotsMapView
                spots={myPosts}
                preferCurrentLocation={false}
                fitBoundsPaddingTopLeft={[30, 30]}
                fitBoundsPaddingBottomRight={[30, 30]}
              />
            </div>
          </div>
        )}
      </div>

      <div className={`max-w-3xl w-full mx-auto px-4 sm:px-6 -mt-2 ${PHOTO_BOTTOM_NAV_SAFE_PADDING_CLASS}`}>
        <button
          onClick={() => (user ? setShowFeedbackModal(true) : setShowAuthModal(true))}
          className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          <MessageSquarePlus size={18} className="text-orange-500" />
          開発者へ要望・改善案を送る
        </button>
        <Link href="/terms" className="block mt-3 text-center text-xs text-gray-500 underline">
          利用規約
        </Link>
      </div>

      <PhotoBottomNav
        onRequestUpload={() => {
          if (!user) {
            setShowAuthModal(true);
            return false;
          }
          return true;
        }}
        onFilesSelected={(files) => {
          setPhotoUploadInitialFiles(files);
          setShowPhotoUploadModal(true);
        }}
      />

      {showFeedbackModal && <FeedbackModal onClose={() => setShowFeedbackModal(false)} />}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showPhotoUploadModal && (
        <PhotoUploadModal
          initialFiles={photoUploadInitialFiles}
          onClose={() => setShowPhotoUploadModal(false)}
          onCreated={refetchPhotoSpots}
        />
      )}
      {showProfileEditModal && (
        <ProfileEditModal
          defaultDisplayName={photoProfile?.displayName ?? "ゲスト"}
          onClose={() => setShowProfileEditModal(false)}
        />
      )}
      {selectedPhoto && (
        <PhotoSpotDetailModal
          spot={selectedPhoto.spot}
          photo={selectedPhoto.photo}
          onClose={() => setSelectedPhoto(null)}
          onUpdated={async () => {
            const latest = await getAllPhotoSpots();
            setSpots(latest);
            const updatedSpot = latest.find((s) => s.id === selectedPhoto.spot.id);
            const updatedPhoto = updatedSpot
              ? getPhotoSpotPhotos(updatedSpot).find((p) => p.url === selectedPhoto.photo.url)
              : undefined;
            setSelectedPhoto(updatedSpot && updatedPhoto ? { spot: updatedSpot, photo: updatedPhoto } : null);
          }}
        />
      )}
    </div>
  );
}
