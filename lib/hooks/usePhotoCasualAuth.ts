"use client";

// 「ここトレ！」(photoモード)専用: 「いいね」「保存」機能のための簡易ログイン状態。
//
// 注意: SpotBase本体の認証(lib/AuthProvider.tsx・Firebase Authentication)とは
// 別物。ここトレ！のギャラリー閲覧自体は組織アカウント(profile)でのログインが
// 前提だが、「いいね」「保存」はより気軽な一般ユーザー向け機能として、
// ブラウザに保存される簡易的な会員登録状態だけで使えるようにする
// (実際のアカウント基盤に接続する際は、この簡易実装を置き換える想定)。
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "kokotore_casual_auth";
const EVENT_NAME = "kokotore-casual-auth-changed";

function readIsLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function usePhotoCasualAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(readIsLoggedIn());
    function handleChange() {
      setIsLoggedIn(readIsLoggedIn());
    }
    window.addEventListener(EVENT_NAME, handleChange);
    window.addEventListener("storage", handleChange);
    return () => {
      window.removeEventListener(EVENT_NAME, handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  const login = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // localStorage不可の環境(プライベートブラウジング等)では簡易ログインを諦める
    }
    setIsLoggedIn(true);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  const logout = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 無視
    }
    setIsLoggedIn(false);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  return { isLoggedIn, login, logout };
}
