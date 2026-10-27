// 「ここトレ！」専用: アカウント削除(退会)。App Store審査ガイドライン5.1.1(v)対応。
// 本人の投稿(photo_spots + Storageの写真)・自分メモ・プロフィールを削除したうえで、
// Firebase Authのユーザー自体を削除する。
// 通報(photo_reports)・要望/問い合わせは運営の記録としてクライアントからは削除できないため残る。
import { deleteUser, EmailAuthProvider, reauthenticateWithCredential, signOut } from "firebase/auth";
import { collection, deleteDoc, doc, getDocs, query, where } from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { auth, db, storage } from "./firebase";

async function deleteStorageUrl(url: string | undefined) {
  if (!url) return;
  try {
    await deleteObject(ref(storage, url));
  } catch (e) {
    // 既に無い・権限が無い等は無視して削除を続行する
    console.warn("ここトレ！: 画像の削除をスキップしました", e);
  }
}

export function deleteAccountErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "パスワードが正しくありません";
    case "auth/too-many-requests":
      return "試行回数が多すぎます。しばらくしてから再度お試しください";
    case "auth/network-request-failed":
      return "通信エラーが発生しました。電波状況を確認して再度お試しください";
    default:
      return "アカウントの削除に失敗しました。時間をおいて再度お試しください";
  }
}

export async function deletePhotoAccount(password: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error("ログインが必要です");

  // 削除は「最近のログイン」が必須のため、先にパスワードで再認証する
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));

  const uid = user.uid;

  const spots = await getDocs(query(collection(db, "photo_spots"), where("postedBy", "==", uid)));
  for (const d of spots.docs) {
    const urls: string[] = d.data().photoUrls ?? [];
    await Promise.all(urls.map(deleteStorageUrl));
    await deleteDoc(d.ref);
  }

  const memos = await getDocs(query(collection(db, "photo_quick_memos"), where("uid", "==", uid)));
  for (const d of memos.docs) {
    await deleteStorageUrl(d.data().photoUrl);
    await deleteDoc(d.ref);
  }

  await deleteDoc(doc(db, "photo_users", uid));
  await deleteUser(user);
  await signOut(auth).catch(() => {});
}
