"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserProfile, type UserProfile } from "@/lib/userProfile";
import { getOrCreatePhotoUserProfile, type PhotoUserProfile } from "@/lib/photoAuth";
import { APP_MODE } from "@/lib/config";

type AuthContextValue = {
  user: User | null;
  // SpotBase本体(pro)の組織/分類ベースのプロフィール("users"コレクション)
  profile: UserProfile | null;
  // 「ここトレ！」(photo)専用の会員プロフィール("photo_users"コレクション)。
  // proモードでは常にnull(取得自体を行わない)。
  photoProfile: PhotoUserProfile | null;
  // photo_usersの取得・自動生成(getOrCreatePhotoUserProfile)がFirestoreの
  // セキュリティルール等で失敗した場合のエラーメッセージ。photoモード専用。
  photoProfileError: string | null;
  loading: boolean;
  // photoProfileの取得・自動生成を手動でやり直す(トーストの「再試行」ボタン等から呼ぶ)。
  // 成功した場合はtrue、失敗した場合はfalseを返す。
  retryPhotoProfile: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  photoProfile: null,
  photoProfileError: null,
  loading: true,
  retryPhotoProfile: async () => false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [photoProfile, setPhotoProfile] = useState<PhotoUserProfile | null>(null);
  const [photoProfileError, setPhotoProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 「ここトレ！」専用: photo_usersの取得(無ければ自動生成)を行い、成功/失敗を
  // stateへ反映する。認証状態変化時と、手動リトライ(retryPhotoProfile)の両方から使う。
  const loadPhotoProfile = useCallback(async (firebaseUser: User): Promise<boolean> => {
    try {
      console.log("[Auth] checking photo_users for:", firebaseUser.uid);
      const p = await getOrCreatePhotoUserProfile(firebaseUser);
      setPhotoProfile(p);
      setPhotoProfileError(null);
      return true;
    } catch (err) {
      console.error("[Auth] photo_users取得・自動生成に失敗しました:", err);
      setPhotoProfile(null);
      setPhotoProfileError(
        "ユーザー情報の取得に失敗しました。しばらくしてから再度お試しください。"
      );
      return false;
    }
  }, []);

  const retryPhotoProfile = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    return loadPhotoProfile(user);
  }, [user, loadPhotoProfile]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        if (APP_MODE === "photo") {
          // 「ここトレ！」ではSpotBase本体の"users"コレクション(Admin SDK経由でしか
          // 書き込めない)は参照せず、自己登録可能な"photo_users"のみを見る。
          // SpotBase本体(pro)で既にFirebase Authアカウントを持つユーザーが
          // ここトレ！に来た場合、"photo_users"側のプロフィールがまだ存在しない
          // ことがあるため、無ければ自動生成してそのまま使えるようにする
          // (getOrCreatePhotoUserProfile自体も内部で数回リトライする)。
          await loadPhotoProfile(firebaseUser);
          setProfile(null);
        } else {
          try {
            const p = await getUserProfile(firebaseUser.uid);
            setProfile(p);
          } catch (err) {
            console.error(err);
            setProfile(null);
          }
          setPhotoProfile(null);
        }
      } else {
        setProfile(null);
        setPhotoProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [loadPhotoProfile]);

  return (
    <AuthContext.Provider
      value={{ user, profile, photoProfile, photoProfileError, loading, retryPhotoProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
