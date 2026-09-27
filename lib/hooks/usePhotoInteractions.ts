"use client";

// 「ここトレ！」(photoモード)専用: 写真ごとの「いいね」数・「保存済み」状態を
// 端末の永続ストレージ(@capacitor/preferences。iOSのlocalStorage自動クリアに
// 強い)で管理する簡易実装。
import { useCallback, useEffect, useState } from "react";
import { readJson, writeJson } from "@/lib/photoStorage";

const LIKES_KEY = "kokotore_likes"; // { [photoKey]: number }
const LIKED_BY_ME_KEY = "kokotore_liked_by_me"; // string[]
const SAVED_KEY = "kokotore_saved"; // string[]
const SAVE_COUNTS_KEY = "kokotore_save_counts"; // { [photoKey]: number }
const EVENT_NAME = "kokotore-interactions-changed";

export function photoKey(spotId: string, url: string): string {
  return `${spotId}:${url}`;
}

export function usePhotoInteractions(key: string) {
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveCount, setSaveCount] = useState(0);

  const refresh = useCallback(async () => {
    const [likes, likedByMe, savedList, saveCounts] = await Promise.all([
      readJson<Record<string, number>>(LIKES_KEY, {}),
      readJson<string[]>(LIKED_BY_ME_KEY, []),
      readJson<string[]>(SAVED_KEY, []),
      readJson<Record<string, number>>(SAVE_COUNTS_KEY, {}),
    ]);
    setLikeCount(likes[key] ?? 0);
    setLiked(likedByMe.includes(key));
    setSaved(savedList.includes(key));
    setSaveCount(saveCounts[key] ?? 0);
  }, [key]);

  useEffect(() => {
    refresh();
    function handleChange() {
      refresh();
    }
    window.addEventListener(EVENT_NAME, handleChange);
    return () => window.removeEventListener(EVENT_NAME, handleChange);
  }, [refresh]);

  const toggleLike = useCallback(async () => {
    const [likes, likedByMe] = await Promise.all([
      readJson<Record<string, number>>(LIKES_KEY, {}),
      readJson<string[]>(LIKED_BY_ME_KEY, []),
    ]);
    const isLiked = likedByMe.includes(key);
    const nextCount = Math.max(0, (likes[key] ?? 0) + (isLiked ? -1 : 1));
    likes[key] = nextCount;
    const nextLikedByMe = isLiked ? likedByMe.filter((k) => k !== key) : [...likedByMe, key];
    await Promise.all([writeJson(LIKES_KEY, likes), writeJson(LIKED_BY_ME_KEY, nextLikedByMe)]);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, [key]);

  const toggleSave = useCallback(async () => {
    const [savedList, saveCounts] = await Promise.all([
      readJson<string[]>(SAVED_KEY, []),
      readJson<Record<string, number>>(SAVE_COUNTS_KEY, {}),
    ]);
    const isSaved = savedList.includes(key);
    const next = isSaved ? savedList.filter((k) => k !== key) : [...savedList, key];
    const nextCount = Math.max(0, (saveCounts[key] ?? 0) + (isSaved ? -1 : 1));
    saveCounts[key] = nextCount;
    await Promise.all([writeJson(SAVED_KEY, next), writeJson(SAVE_COUNTS_KEY, saveCounts)]);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, [key]);

  return { likeCount, liked, saved, saveCount, toggleLike, toggleSave };
}

// マイページ/保存一覧で使う: 保存済みキー(spotId:url)の一覧を取得する
export async function getSavedPhotoKeys(): Promise<string[]> {
  return readJson<string[]>(SAVED_KEY, []);
}

// マイページ「保存したスポット」タブ用: 保存済みキー一覧をリアクティブに取得するフック
export function useSavedPhotoKeys(): string[] {
  const [keys, setKeys] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setKeys(await readJson<string[]>(SAVED_KEY, []));
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(EVENT_NAME, refresh);
    return () => window.removeEventListener(EVENT_NAME, refresh);
  }, [refresh]);

  return keys;
}
