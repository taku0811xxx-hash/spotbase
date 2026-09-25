"use client";

// 「ここトレ！」(photoモード)専用: 写真ごとの「いいね」数・「保存済み」状態を
// ブラウザのlocalStorageで管理する簡易実装。usePhotoCasualAuth(簡易ログイン状態)と
// 組み合わせて使う想定(未ログイン時はAuthModalへ誘導し、ログイン済みの場合のみ
// カウント増加・保存リストへの追加を行う)。
import { useCallback, useEffect, useState } from "react";

const LIKES_KEY = "kokotore_likes"; // { [photoKey]: number }
const LIKED_BY_ME_KEY = "kokotore_liked_by_me"; // string[]
const SAVED_KEY = "kokotore_saved"; // string[]
const EVENT_NAME = "kokotore-interactions-changed";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 無視(プライベートブラウジング等でlocalStorageが使えない場合)
  }
}

export function photoKey(spotId: string, url: string): string {
  return `${spotId}:${url}`;
}

export function usePhotoInteractions(key: string) {
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);

  const refresh = useCallback(() => {
    const likes = readJson<Record<string, number>>(LIKES_KEY, {});
    const likedByMe = readJson<string[]>(LIKED_BY_ME_KEY, []);
    const savedList = readJson<string[]>(SAVED_KEY, []);
    setLikeCount(likes[key] ?? 0);
    setLiked(likedByMe.includes(key));
    setSaved(savedList.includes(key));
  }, [key]);

  useEffect(() => {
    refresh();
    window.addEventListener(EVENT_NAME, refresh);
    return () => window.removeEventListener(EVENT_NAME, refresh);
  }, [refresh]);

  const toggleLike = useCallback(() => {
    const likes = readJson<Record<string, number>>(LIKES_KEY, {});
    const likedByMe = readJson<string[]>(LIKED_BY_ME_KEY, []);
    const isLiked = likedByMe.includes(key);
    const nextCount = Math.max(0, (likes[key] ?? 0) + (isLiked ? -1 : 1));
    likes[key] = nextCount;
    const nextLikedByMe = isLiked ? likedByMe.filter((k) => k !== key) : [...likedByMe, key];
    writeJson(LIKES_KEY, likes);
    writeJson(LIKED_BY_ME_KEY, nextLikedByMe);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, [key]);

  const toggleSave = useCallback(() => {
    const savedList = readJson<string[]>(SAVED_KEY, []);
    const isSaved = savedList.includes(key);
    const next = isSaved ? savedList.filter((k) => k !== key) : [...savedList, key];
    writeJson(SAVED_KEY, next);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, [key]);

  return { likeCount, liked, saved, toggleLike, toggleSave };
}

// マイページ/保存一覧で使う: 保存済みキー(spotId:url)の一覧を取得する
export function getSavedPhotoKeys(): string[] {
  return readJson<string[]>(SAVED_KEY, []);
}

// マイページ「保存したスポット」タブ用: 保存済みキー一覧をリアクティブに取得するフック
export function useSavedPhotoKeys(): string[] {
  const [keys, setKeys] = useState<string[]>([]);

  const refresh = useCallback(() => {
    setKeys(readJson<string[]>(SAVED_KEY, []));
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(EVENT_NAME, refresh);
    return () => window.removeEventListener(EVENT_NAME, refresh);
  }, [refresh]);

  return keys;
}
