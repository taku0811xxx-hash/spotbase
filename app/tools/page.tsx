"use client";

// 「ここトレ！」(APP_MODE === 'photo')専用: 撮影前のロケハン・機材チェック・
// 環境確認が完結する「撮影準備」タブ。ボトムナビの5番目の項目として、
// ホーム/地図/投稿/マイページと並ぶ。SpotBase本体(pro)側には存在しない
// photoモード専用の画面。
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { APP_MODE } from "@/lib/config";
import type { PhotoSpot } from "@/lib/types/photoSpot";
import PhotoHeaderNav from "@/components/PhotoHeaderNav";
import PhotoBottomNav, { PHOTO_BOTTOM_NAV_SAFE_PADDING_CLASS } from "@/components/PhotoBottomNav";
import PhotoUploadModal from "@/components/PhotoUploadModal";
import AuthModal from "@/components/AuthModal";
import EquipmentChecklist from "@/components/EquipmentChecklist";
import EnvironmentData from "@/components/EnvironmentData";
import SpotPlanner from "@/components/SpotPlanner";

type ToolsTab = "equipment" | "environment" | "planner";

export default function ToolsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<ToolsTab>("equipment");
  const [selectedSpot, setSelectedSpot] = useState<PhotoSpot | null>(null);
  const [showPhotoUploadModal, setShowPhotoUploadModal] = useState(false);
  const [photoUploadInitialFiles, setPhotoUploadInitialFiles] = useState<File[]>([]);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    // pro向けのURLとしてこのページに来た場合は、本体側のホームへ戻す
    if (APP_MODE !== "photo") {
      router.push("/");
    }
  }, [router]);

  if (APP_MODE !== "photo") return null;

  const tabs: { key: ToolsTab; label: string }[] = [
    { key: "equipment", label: "機材" },
    { key: "environment", label: "環境" },
    { key: "planner", label: "場所" },
  ];

  return (
    <div className="w-full max-w-full overflow-x-hidden flex flex-col bg-gray-100 min-h-[100dvh]">
      <div className="app-header relative z-[9999] bg-gradient-to-r from-blue-500 to-indigo-600 flex-shrink-0">
        <PhotoHeaderNav />
      </div>

      <div className={`flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 space-y-4 ${PHOTO_BOTTOM_NAV_SAFE_PADDING_CLASS}`}>
        <div>
          <h2 className="text-lg font-bold text-gray-900">撮影準備</h2>
          <p className="text-xs text-gray-400 mt-0.5">機材チェック・日照確認・行きたいスポットの整理がここで完結します</p>
        </div>

        <div className="flex gap-2 border-b border-gray-200">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                tab === key ? "border-orange-500 text-orange-600" : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "equipment" && <EquipmentChecklist />}
        {tab === "environment" && <EnvironmentData spot={selectedSpot} />}
        {tab === "planner" && (
          <SpotPlanner
            onSelectSpot={(spot) => {
              setSelectedSpot(spot);
              setTab("environment");
            }}
          />
        )}
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
