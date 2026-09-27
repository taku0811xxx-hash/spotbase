"use client";

// 「ここトレ！」(photoモード)専用: マイページの「プロフィール編集」モーダル。
// AuthModal.tsxと同様、ギャラリーのgrid/flexレイアウトの影響を受けないよう
// createPortalでdocument.body直下に描画する。
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePhotoProfile } from "@/lib/hooks/usePhotoProfile";

type Props = {
  defaultDisplayName: string;
  onClose: () => void;
};

export default function ProfileEditModal({ defaultDisplayName, onClose }: Props) {
  const { displayName, avatarDataUrl, setDisplayName, setAvatarFile } = usePhotoProfile(defaultDisplayName);
  const [nameInput, setNameInput] = useState(displayName);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleAvatarChange(file: File) {
    setUploading(true);
    try {
      await setAvatarFile(file);
    } finally {
      setUploading(false);
    }
  }

  function handleSave() {
    setDisplayName(nameInput.trim() || defaultDisplayName);
    onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-5 text-gray-400 hover:text-gray-700 text-xl leading-none"
          aria-label="閉じる"
        >
          ×
        </button>

        <h2 className="text-lg font-bold text-gray-900 mb-4">プロフィール編集</h2>

        <div className="flex flex-col items-center mb-5">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="relative w-20 h-20 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white text-2xl font-bold overflow-hidden"
          >
            {avatarDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarDataUrl} alt="アイコン" className="w-full h-full object-cover" />
            ) : (
              nameInput.charAt(0) || "?"
            )}
            <span className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center border-2 border-white">
              📷
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleAvatarChange(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="mt-2 text-xs text-orange-600 hover:text-orange-700 font-semibold disabled:opacity-50"
          >
            {uploading ? "アップロード中..." : "画像を変更"}
          </button>
        </div>

        <label className="block text-xs font-semibold text-gray-500 mb-1">ユーザー名(表示名)</label>
        <input
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-5"
        />

        <button
          onClick={handleSave}
          className="w-full rounded-lg py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-pink-500 hover:shadow-md transition-shadow"
        >
          保存する
        </button>
      </div>
    </div>,
    document.body
  );
}
