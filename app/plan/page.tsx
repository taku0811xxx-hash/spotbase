"use client";

// 「ここトレ！」(photoモード)専用: 季節のおすすめ提案〜撮影計画までを案内する「プラン」タブ。
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { APP_MODE } from "@/lib/config";
import PhotoHeaderNav from "@/components/PhotoHeaderNav";
import PhotoBottomNav, { PHOTO_BOTTOM_NAV_SAFE_PADDING_CLASS } from "@/components/PhotoBottomNav";
import PhotoUploadModal from "@/components/PhotoUploadModal";
import AuthModal from "@/components/AuthModal";
import PlanView from "@/components/PlanView";

export default function PlanPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [showPhotoUploadModal, setShowPhotoUploadModal] = useState(false);
  const [photoUploadInitialFiles, setPhotoUploadInitialFiles] = useState<File[]>([]);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    if (APP_MODE !== "photo") router.push("/");
  }, [router]);

  if (APP_MODE !== "photo") return null;

  return (
    <div className="w-full max-w-full overflow-x-hidden flex flex-col bg-gray-100 min-h-[100dvh]">
      <div className="app-header relative z-[9999] bg-gradient-to-r from-blue-500 to-indigo-600 flex-shrink-0">
        <PhotoHeaderNav />
      </div>
      <div className={`flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 ${PHOTO_BOTTOM_NAV_SAFE_PADDING_CLASS}`}>
        <PlanView />
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
      {showPhotoUploadModal && (
        <PhotoUploadModal
          initialFiles={photoUploadInitialFiles}
          onClose={() => setShowPhotoUploadModal(false)}
          onCreated={() => setShowPhotoUploadModal(false)}
        />
      )}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
}
