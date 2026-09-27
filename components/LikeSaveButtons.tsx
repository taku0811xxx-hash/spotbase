"use client";

// 「ここトレ！」(photoモード)専用: 「いいね」「保存」ボタン。
// ギャラリーカード・詳細ビュー両方から使う共通コンポーネント。
// 未ログインの場合はAuthModalを開いて会員登録・ログインを促し、アクションは中断する
// (モーダルのボタンから/login・/signupへ遷移する)。
// Instagram風に、黒透過の小さな丸ボタン + Heart/Bookmarkのラインアイコンで統一する。
import { useState } from "react";
import { Heart, Bookmark, BookmarkCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { usePhotoInteractions, photoKey } from "@/lib/hooks/usePhotoInteractions";
import AuthModal from "@/components/AuthModal";

type Props = {
  spotId: string;
  url: string;
  // ギャラリーカード上に重ねる小さめ表示か、詳細パネル用の少し大きい表示か
  size?: "sm" | "md";
  // ギャラリーカードのbutton要素の中で使う場合、クリックがカード選択に伝播しないようにする
  stopPropagation?: boolean;
};

export default function LikeSaveButtons({ spotId, url, size = "sm", stopPropagation = false }: Props) {
  const { user } = useAuth();
  const { likeCount, liked, saved, saveCount, toggleLike, toggleSave } = usePhotoInteractions(
    photoKey(spotId, url)
  );
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [pulseKey, setPulseKey] = useState<"like" | "save" | null>(null);

  function runOrPromptAuth(action: "like" | "save", e: React.MouseEvent) {
    if (stopPropagation) e.stopPropagation();
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (action === "like") toggleLike();
    else toggleSave();
    setPulseKey(action);
    window.setTimeout(() => setPulseKey(null), 300);
  }

  // Instagram風: ボタン自体は黒透過(bg-black/40)の小さな丸型、アイコンは約半分のサイズに縮小
  const buttonPadding = size === "sm" ? "p-1" : "p-1.5";
  const iconPx = size === "sm" ? 14 : 18;

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => runOrPromptAuth("like", e)}
          className={`flex items-center gap-1 rounded-full bg-black/40 backdrop-blur-sm ${buttonPadding} transition-transform ${
            pulseKey === "like" ? "scale-125" : "scale-100"
          }`}
          aria-label="いいね"
        >
          <Heart
            size={iconPx}
            strokeWidth={2}
            className={liked ? "fill-pink-500 text-pink-500" : "text-white"}
          />
          {likeCount > 0 && <span className="text-[10px] font-semibold text-white pr-0.5">{likeCount}</span>}
        </button>
        <button
          onClick={(e) => runOrPromptAuth("save", e)}
          className={`flex items-center rounded-full bg-black/40 backdrop-blur-sm ${buttonPadding} transition-transform ${
            pulseKey === "save" ? "scale-125" : "scale-100"
          }`}
          aria-label="保存"
        >
          {saved ? (
            <BookmarkCheck size={iconPx} strokeWidth={2} className="fill-orange-500 text-orange-500" />
          ) : (
            <Bookmark size={iconPx} strokeWidth={2} className="text-white" />
          )}
          {saveCount > 0 && <span className="text-[10px] font-semibold text-white pr-0.5">{saveCount}</span>}
        </button>
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </>
  );
}
