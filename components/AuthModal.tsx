"use client";

// 「ここトレ！」(photoモード)専用: 未ログインのゲストが「いいね」「保存」「新規投稿」等の
// アクションを行おうとした際に割り込み表示する「会員登録・ログインが必要です」モーダル。
// ボタンからログイン画面(/login)・新規会員登録画面(/signup)へ遷移する。
//
// 呼び出し元(LikeSaveButtonsやトップページのヘッダー等)はギャラリーのgrid/flexレイアウトの
// 奥深くにネストされていることがあるため、そのままDOM上の子として描画すると祖先要素の
// transform/overflow等の影響でfixed配置が崩れる(画面左端に縦長で潰れる)ことがある。
// createPortalでdocument.body直下に描画し、レイアウトの影響を受けないようにする。
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

type Props = {
  onClose: () => void;
};

export default function AuthModal({ onClose }: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function goToLogin() {
    onClose();
    try {
      router.push("/login");
    } catch (error) {
      console.error("ここトレ！: ログイン画面への遷移に失敗しました", error);
    }
  }

  function goToSignup() {
    onClose();
    try {
      router.push("/signup");
    } catch (error) {
      console.error("ここトレ！: 新規登録画面への遷移に失敗しました", error);
    }
  }

  if (!mounted) return null;

  return createPortal(
    // z-indexはLeafletの内蔵コントロール(.leaflet-top等、z-index:1000)や
    // 地図画面のフィルターバーオーバーレイ(z-[1100])より確実に手前へ出るよう、
    // 十分高い値(z-[9999])をバックドロップ・本体の両方に設定する。
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative z-[9999] bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-5 text-gray-400 hover:text-gray-700 text-xl leading-none"
          aria-label="閉じる"
        >
          ×
        </button>

        <div className="text-3xl mb-2">📸</div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">会員登録・ログインが必要です</h2>
        <p className="text-sm text-gray-500 mb-6">
          無料会員登録をして、お気に入りの写真や撮影スポットを保存・投稿しよう！
        </p>

        <div className="space-y-2.5">
          <button
            onClick={goToLogin}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-pink-500 hover:shadow-md transition-shadow"
          >
            ログイン
          </button>
          <button
            onClick={goToSignup}
            className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            新規会員登録
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-4 text-xs text-gray-400 hover:text-gray-600 underline"
        >
          今はしない
        </button>
      </div>
    </div>,
    document.body
  );
}
