"use client";

// 「ここトレ！」(photoモード)専用: マイページの「表示名」「アイコン画像」の
// 簡易プロフィール編集状態。SpotBase本体の実際のユーザープロフィール
// (lib/userProfile.ts、Firestoreのusersコレクション・Admin SDK経由でのみ書き込み可能)
// は変更せず、あくまで表示用の上書き情報を端末の永続ストレージ
// (@capacitor/preferences。iOSのlocalStorage自動クリアに強い)に保存する。
import { useCallback, useEffect, useState } from "react";
import { compressImage } from "@/lib/imageCompression";
import { readJson, writeJson } from "@/lib/photoStorage";

const STORAGE_KEY = "kokotore_profile_override";
const EVENT_NAME = "kokotore-profile-changed";

type ProfileOverride = {
  displayName?: string;
  avatarDataUrl?: string;
};

function readOverride(): Promise<ProfileOverride> {
  return readJson<ProfileOverride>(STORAGE_KEY, {});
}

async function writeOverride(value: ProfileOverride) {
  await writeJson(STORAGE_KEY, value);
  window.dispatchEvent(new Event(EVENT_NAME));
}

// アイコン画像は永続ストレージの容量制限を考慮し、96x96程度まで縮小してから
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
// defaultAvatarUrl: 同様に、ローカルでアイコンを未設定の場合に使う
// photoProfile.photoURL(Firebase Authのuser.photoURLを引き継いだもの)由来の初期値
export function usePhotoProfile(defaultDisplayName: string, defaultAvatarUrl?: string | null) {
  const [override, setOverrideState] = useState<ProfileOverride>({});

  useEffect(() => {
    let cancelled = false;
    function load() {
      readOverride().then((value) => {
        if (!cancelled) setOverrideState(value);
      });
    }
    load();
    window.addEventListener(EVENT_NAME, load);
    return () => {
      cancelled = true;
      window.removeEventListener(EVENT_NAME, load);
    };
  }, []);

  const displayName = override.displayName?.trim() || defaultDisplayName;
  const avatarDataUrl = override.avatarDataUrl ?? defaultAvatarUrl ?? null;

  const setDisplayName = useCallback(async (name: string) => {
    const current = await readOverride();
    await writeOverride({ ...current, displayName: name });
  }, []);

  const setAvatarFile = useCallback(async (file: File) => {
    const dataUrl = await fileToSmallDataUrl(file);
    const current = await readOverride();
    await writeOverride({ ...current, avatarDataUrl: dataUrl });
  }, []);

  return { displayName, avatarDataUrl, setDisplayName, setAvatarFile };
}
