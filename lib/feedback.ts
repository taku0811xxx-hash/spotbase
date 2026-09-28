// 「ここトレ！」専用: ユーザーからの要望・改善リクエストをFirestore("photo_feedback")へ保存する。
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

export const FEEDBACK_CATEGORIES = ["機能追加", "バグ報告", "データ修正", "その他"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export async function sendFeedback(category: FeedbackCategory, message: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("ログインが必要です");
  await addDoc(collection(db, "photo_feedback"), {
    uid: user.uid,
    category,
    message: message.trim(),
    createdAt: serverTimestamp(),
  });
}
