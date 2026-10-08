// 「ここトレ！」サポートページ(/support)の問い合わせを"photo_support_inquiries"へ保存する。
// App Store審査用の公開ページのため、未ログインでも送信できる。
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

export const SUPPORT_CATEGORIES = ["使い方について", "不具合の報告", "ご意見・ご要望", "アカウント・その他"] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export async function sendSupportInquiry(input: {
  category: SupportCategory;
  name: string;
  email: string;
  message: string;
}): Promise<void> {
  await addDoc(collection(db, "photo_support_inquiries"), {
    uid: auth.currentUser?.uid ?? null,
    category: input.category,
    name: input.name.trim().slice(0, 100),
    email: input.email.trim().slice(0, 200),
    message: input.message.trim().slice(0, 2000),
    createdAt: serverTimestamp(),
  });
}
