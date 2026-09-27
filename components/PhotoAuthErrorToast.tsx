"use client";

// 「ここトレ！」(photoモード)専用: photo_usersの取得・自動生成
// (AuthProvider→lib/photoAuth.tsのgetOrCreatePhotoUserProfile)がFirestoreの
// セキュリティルール等で失敗した場合に、原因が分かるようトーストで知らせる。
// app/layout.tsxでphotoモード時のみAuthProviderの子として常時マウントする。
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import Toast, { type ToastState } from "@/components/Toast";

export default function PhotoAuthErrorToast() {
  const { photoProfileError } = useAuth();
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    if (photoProfileError) {
      setToast({ type: "error", message: photoProfileError });
    }
  }, [photoProfileError]);

  return <Toast toast={toast} onDismiss={() => setToast(null)} />;
}
