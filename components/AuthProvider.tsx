"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserProfile, type UserProfile } from "@/lib/userProfile";
import { getPhotoUserProfile, type PhotoUserProfile } from "@/lib/photoAuth";
import { APP_MODE } from "@/lib/config";

type AuthContextValue = {
  user: User | null;
  // SpotBase本体(pro)の組織/分類ベースのプロフィール("users"コレクション)
  profile: UserProfile | null;
  // 「ここトレ！」(photo)専用の会員プロフィール("photo_users"コレクション)。
  // proモードでは常にnull(取得自体を行わない)。
  photoProfile: PhotoUserProfile | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  photoProfile: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [photoProfile, setPhotoProfile] = useState<PhotoUserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        if (APP_MODE === "photo") {
          // 「ここトレ！」ではSpotBase本体の"users"コレクション(Admin SDK経由でしか
          // 書き込めない)は参照せず、自己登録可能な"photo_users"のみを見る。
          try {
            const p = await getPhotoUserProfile(firebaseUser.uid);
            setPhotoProfile(p);
          } catch (err) {
            console.error(err);
            setPhotoProfile(null);
          }
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
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, photoProfile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
