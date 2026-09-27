// 「ここトレ！」(APP_MODE === 'photo')専用の会員登録・プロフィール処理。
// SpotBase本体の認証(lib/auth.ts・"users"コレクション・組織/分類モデル)とは
// 完全に独立しており、Firebase Authのユーザー自体は共有インフラ(lib/firebase.ts)を
// 使うが、プロフィールは"photo_users"コレクションにのみ保存する
// (組織/分類の概念を持たない、パブリックな会員登録)。
import { createUserWithEmailAndPassword, updateProfile, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { UserProfile, UserCategory } from "./userProfile";

const PHOTO_USERS_COLLECTION = "photo_users";

export type PhotoUserProfile = {
  uid: string;
  email: string;
  displayName: string;
  // Firebase Authのuser.photoURL(Google等の外部プロバイダ由来)を引き継いだもの。
  // 現状メール+パスワードのみのためほぼnullだが、将来の拡張に備えて保持する。
  photoURL: string | null;
  createdAt: string | null;
};

type PhotoUserDoc = {
  email: string;
  displayName: string;
  photoURL?: string | null;
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
    photoURL: credential.user.photoURL ?? null,
    createdAt: serverTimestamp(),
  });

  return {
    uid: credential.user.uid,
    email,
    displayName: trimmedName,
    photoURL: credential.user.photoURL ?? null,
    createdAt: null,
  };
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
    photoURL: data.photoURL ?? null,
    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
  };
}

// メールアドレスの@より前の部分を、表示名未設定時のフォールバックに使う
function displayNameFromEmail(email: string | null | undefined): string {
  return email?.split("@")[0] || "ゲスト";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// SpotBase本体(pro)で既にFirebase Authアカウントを持つユーザーが「ここトレ！」に
// 来た場合、"photo_users"に自分のプロフィールドキュメントがまだ存在しないことがある
// (proとphotoは同じFirebase Authユーザーを共有するが、プロフィールコレクションは
// 完全に分離しているため)。この場合にログインをエラーにせず、既存のFirebase Auth
// ユーザー情報(表示名・メールアドレス・photoURL)から"photo_users/{uid}"を自動生成し、
// そのままここトレ！を使い始められるようにする。
//
// ネットワークの瞬断やFirestoreへの初回接続タイミング等による一時的な失敗で
// 「アカウントのプロフィール情報が見つかりませんでした」に直行してしまわないよう、
// 生成処理自体を短い間隔を空けて最大3回まで自動リトライする。それでも失敗した
// 場合のみ、呼び出し元(AuthProvider)がエラー内容をトーストで表示できるよう
// そのまま例外を投げる。
export async function getOrCreatePhotoUserProfile(user: User): Promise<PhotoUserProfile> {
  const RETRY_DELAYS_MS = [0, 500, 1500];
  let lastError: unknown = null;

  for (const delay of RETRY_DELAYS_MS) {
    if (delay > 0) {
      console.warn(`[Auth] photo_usersの取得・生成に失敗したため${delay}ms後に再試行します:`, lastError);
      await wait(delay);
    }
    try {
      const existing = await getPhotoUserProfile(user.uid);
      if (existing) return existing;

      const displayName = user.displayName || displayNameFromEmail(user.email) || "ゲスト";
      const email = user.email || "";
      const photoURL = user.photoURL ?? null;

      await setDoc(doc(db, PHOTO_USERS_COLLECTION, user.uid), {
        email,
        displayName,
        photoURL,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      console.log("[Auth] photo_users generated for:", user.uid);

      return { uid: user.uid, email, displayName, photoURL, createdAt: null };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}
