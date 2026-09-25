"use client";

// 「ここトレ！」(photoモード)専用: マイページの「表示名」「アイコン画像」の
// 簡易プロフィール編集状態。SpotBase本体の実際のユーザープロフィール
// (lib/userProfile.ts、Firestoreのusersコレクション・Admin SDK経由でのみ書き込み可能)
// は変更せず、あくまで表示用の上書き情報をブラウザのlocalStorageに保存する
// (usePhotoCasualAuth.tsと同じ設計方針)。
import { useCallback, useEffect, useState } from "react";
import { compressImage } from "@/lib/imageCompression";

const STORAGE_KEY = "kokotore_profile_override";
const EVENT_NAME = "kokotore-profile-changed";

type ProfileOverride = {
  displayName?: string;
  avatarDataUrl?: string;
};

function readOverride(): ProfileOverride {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProfileOverride) : {};
  } catch {
    return {};
  }
}

function writeOverride(value: ProfileOverride) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // 無視(プライベートブラウジング等でlocalStorageが使えない場合)
  }
  window.dispatchEvent(new Event(EVENT_NAME));
}

// アイコン画像はlocalStorageの容量制限を考慮し、96x96程度まで縮小してから
// data URLとして保存する(compressImageのCanvas処理を流用)。
async function fileToSmallDataUrl(file: File): Promise<string> {
  const { file: resized } = await compressImage(file, {
    maxWidth: 96,
    maxHeight: 96,
    quality: 0.85,
    format: "jpeg",
    maxSizeKB: 80,
  });
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(resized);
  });
}

// defaultDisplayName: 上書きが未設定の場合に使う、実プロフィール(profile.name)由来の初期値
export function usePhotoProfile(defaultDisplayName: string) {
  const [override, setOverrideState] = useState<ProfileOverride>({});

  useEffect(() => {
    setOverrideState(readOverride());
    function handleChange() {
      setOverrideState(readOverride());
    }
    window.addEventListener(EVENT_NAME, handleChange);
    window.addEventListener("storage", handleChange);
    return () => {
      window.removeEventListener(EVENT_NAME, handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  const displayName = override.displayName?.trim() || defaultDisplayName;
  const avatarDataUrl = override.avatarDataUrl ?? null;

  const setDisplayName = useCallback((name: string) => {
    const current = readOverride();
    writeOverride({ ...current, displayName: name });
  }, []);

  const setAvatarFile = useCallback(async (file: File) => {
    const dataUrl = await fileToSmallDataUrl(file);
    const current = readOverride();
    writeOverride({ ...current, avatarDataUrl: dataUrl });
  }, []);

  return { displayName, avatarDataUrl, setDisplayName, setAvatarFile };
}
