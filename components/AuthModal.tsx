"use client";

// 「ここトレ！」(photoモード)専用: 「いいね」「保存」を押した未ログインユーザーを
// 会員登録・ログインへ誘導するモーダル。
// 注意: ここでの「Googleでログイン」「メールアドレスで登録/ログイン」は、
// SpotBase本体の実際のFirebase Authenticationとは別の、
// 簡易ログイン状態(lib/hooks/usePhotoCasualAuth.ts)を有効化するダミー動作。
// 実際の会員登録基盤に接続する際は、このボタンの中身を差し替える想定。
//
// 呼び出し元(LikeSaveButtons)はギャラリーのgrid/flexレイアウトの奥深くに
// ネストされているため、そのままDOM上の子として描画すると祖先要素の
// transform/overflow等の影響でfixed配置が崩れる(画面左端に縦長で潰れる)ことがある。
// createPortalでdocument.body直下に描画し、レイアウトの影響を受けないようにする。
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePhotoCasualAuth } from "@/lib/hooks/usePhotoCasualAuth";

type Props = {
  onClose: () => void;
  // 登録完了後、呼び出し元で「保留にしていたいいね/保存」を続行させるためのコールバック
  onAuthenticated?: () => void;
};

export default function AuthModal({ onClose, onAuthenticated }: Props) {
  const { login } = usePhotoCasualAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function handleDummyLogin() {
    login();
    onAuthenticated?.();
    onClose();
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl text-center"
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
        <h2 className="text-lg font-bold text-gray-900 mb-1">ここトレ！に登録しよう</h2>
        <p className="text-sm text-gray-500 mb-6">
          無料会員登録をして、お気に入りの写真や撮影スポットを保存しよう！
        </p>

        <div className="space-y-2.5">
          <button
            onClick={handleDummyLogin}
            className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span className="text-base">G</span>
            Googleでログイン
          </button>
          <button
            onClick={handleDummyLogin}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-pink-500 hover:shadow-md transition-shadow"
          >
            メールアドレスで登録/ログイン
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
