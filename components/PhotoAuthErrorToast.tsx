"use client";

// 「ここトレ！」(photoモード)専用: photo_usersの取得・自動生成
// (AuthProvider→lib/photoAuth.tsのgetOrCreatePhotoUserProfile)がFirestoreの
// セキュリティルール等で失敗した場合に、原因が分かるようトーストで知らせる。
// 「再試行」ボタンから手動でもう一度作成を試み、成功した場合は画面をリロードして
// 最新のプロフィールで再表示する(失敗時は引き続きエラーを表示する)。
// app/layout.tsxでphotoモード時のみAuthProviderの子として常時マウントする。
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

export default function PhotoAuthErrorToast() {
  const { photoProfileError, retryPhotoProfile } = useAuth();
  const [visible, setVisible] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    setVisible(Boolean(photoProfileError));
  }, [photoProfileError]);

  if (!visible || !photoProfileError) return null;

  async function handleRetry() {
    setRetrying(true);
    try {
      const ok = await retryPhotoProfile();
      if (ok) {
        window.location.reload();
      }
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[2000] animate-[toast-in_0.25s_ease-out]">
      <div className="flex items-center gap-3 rounded-xl shadow-lg border border-red-200 bg-white px-4 py-3 min-w-[280px] max-w-sm">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </div>
        <p className="text-sm text-gray-800 flex-1">{photoProfileError}</p>
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="flex-shrink-0 text-xs font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50"
        >
          {retrying ? "再試行中..." : "再試行"}
        </button>
        <button
          onClick={() => setVisible(false)}
          className="text-gray-400 hover:text-gray-600 flex-shrink-0"
          aria-label="閉じる"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
