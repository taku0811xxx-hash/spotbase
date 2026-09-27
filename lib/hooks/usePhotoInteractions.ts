"use client";

// 「ここトレ！」(photoモード)専用: 写真ごとの「いいね」数・「保存済み」状態を
// 端末の永続ストレージ(@capacitor/preferences。iOSのlocalStorage自動クリアに
// 強い)で管理する簡易実装。
import { useCallback, useEffect, useState } from "react";
import { readJson, writeJson } from "@/lib/photoStorage";

const LIKES_KEY = "kokotore_likes"; // { [photoKey]: number }
const LIKED_BY_ME_KEY = "kokotore_liked_by_me"; // string[]
const SAVED_KEY = "kokotore_saved"; // string[]
const EVENT_NAME = "kokotore-interactions-changed";

export function photoKey(spotId: string, url: string): string {
  return `${spotId}:${url}`;
}

export function usePhotoInteractions(key: string) {
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);

  const refresh = useCallback(async () => {
    const [likes, likedByMe, savedList] = await Promise.all([
      readJson<Record<string, number>>(LIKES_KEY, {}),
      readJson<string[]>(LIKED_BY_ME_KEY, []),
      readJson<string[]>(SAVED_KEY, []),
    ]);
    setLikeCount(likes[key] ?? 0);
    setLiked(likedByMe.includes(key));
    setSaved(savedList.includes(key));
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
    const savedList = await readJson<string[]>(SAVED_KEY, []);
    const isSaved = savedList.includes(key);
    const next = isSaved ? savedList.filter((k) => k !== key) : [...savedList, key];
    await writeJson(SAVED_KEY, next);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, [key]);

  return { likeCount, liked, saved, toggleLike, toggleSave };
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
