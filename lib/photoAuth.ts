// 「ここトレ！」(APP_MODE === 'photo')専用の会員登録・プロフィール処理。
// SpotBase本体の認証(lib/auth.ts・"users"コレクション・組織/分類モデル)とは
// 完全に独立しており、Firebase Authのユーザー自体は共有インフラ(lib/firebase.ts)を
// 使うが、プロフィールは"photo_users"コレクションにのみ保存する
// (組織/分類の概念を持たない、パブリックな会員登録)。
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { UserProfile, UserCategory } from "./userProfile";

const PHOTO_USERS_COLLECTION = "photo_users";

export type PhotoUserProfile = {
  uid: string;
  email: string;
  displayName: string;
  createdAt: string | null;
};

type PhotoUserDoc = {
  email: string;
  displayName: string;
  createdAt: Timestamp | null;
};

// Firebase Authのエラーコードを、ここトレ！の会員登録フォーム向けの
// 分かりやすい日本語メッセージに変換する。
export function photoSignUpErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/email-already-in-use":
      return "このメールアドレスは既に登録されています";
    case "auth/invalid-email":
      return "メールアドレスの形式が正しくありません";
    case "auth/weak-password":
      return "パスワードは6文字以上で入力してください";
    case "auth/too-many-requests":
      return "試行回数が多すぎます。しばらくしてから再度お試しください";
    case "auth/network-request-failed":
      return "通信エラーが発生しました。電波状況を確認して再度お試しください";
    default:
      return "会員登録に失敗しました。時間をおいて再度お試しください";
  }
}

export async function signUpPhotoUser(
  email: string,
  password: string,
  displayName: string
): Promise<PhotoUserProfile> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const trimmedName = displayName.trim() || "ここトレ！ユーザー";

  // Firebase Authのプロフィール(表示名)にも反映しておく(他画面での表示に流用できるように)
  await updateProfile(credential.user, { displayName: trimmedName });

  await setDoc(doc(db, PHOTO_USERS_COLLECTION, credential.user.uid), {
    email,
    displayName: trimmedName,
    createdAt: serverTimestamp(),
  });

  return { uid: credential.user.uid, email, displayName: trimmedName, createdAt: null };
}

// HeaderNav/UserStatusPanelはSpotBase本体のUserProfile(組織/分類ベース)を
// 表示前提のPropsとして持つ。「ここトレ！」のために型を作り直すのではなく、
// 表示にしか使わない項目(name/organizationName等)だけを埋めた表示専用の
// 変換オブジェクトを作ってそのまま渡す(組織/分類のアクセス制御には一切使わない)。
export function toDisplayProfile(photoProfile: PhotoUserProfile | null): UserProfile | null {
  if (!photoProfile) return null;
  return {
    uid: photoProfile.uid,
    email: photoProfile.email,
    name: photoProfile.displayName,
    organizationId: "",
    organizationName: "ここトレ！",
    category: "" as UserCategory,
    accessLevel: "member",
  };
}

export async function getPhotoUserProfile(uid: string): Promise<PhotoUserProfile | null> {
  const snap = await getDoc(doc(db, PHOTO_USERS_COLLECTION, uid));
  if (!snap.exists()) return null;
  const data = snap.data() as PhotoUserDoc;
  return {
    uid,
    email: data.email,
    displayName: data.displayName,
    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
  };
}
