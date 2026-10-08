// 「ここトレ！」専用: App Store審査ガイドライン1.2(UGC)対応。
// 不適切コンテンツ/ユーザーの通報("photo_reports")と、ユーザーブロックを扱う。
// ブロック一覧は端末の永続ストレージ(即時反映・未ログインでも有効)に保存し、
// ログイン中は photo_users/{uid}.blockedUserIds にも同期する(端末をまたいで復元・運営が確認できる)。
import { addDoc, arrayRemove, arrayUnion, collection, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { readJson, writeJson } from "./photoStorage";

export const REPORT_REASONS = ["不適切なコンテンツ", "スパム・嫌がらせ", "著作権侵害", "その他"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportTargetType = "post" | "user";

export async function submitReport(input: {
  targetType: ReportTargetType;
  targetId: string; // 投稿ID or ユーザーID
  targetUid: string; // 対象の投稿者uid(ユーザー通報時はtargetIdと同じ)
  reason: ReportReason;
  detail?: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("ログインが必要です");
  await addDoc(collection(db, "photo_reports"), {
    reporterUid: user.uid,
    targetType: input.targetType,
    targetId: input.targetId,
    targetUid: input.targetUid,
    reason: input.reason,
    detail: (input.detail ?? "").trim().slice(0, 500),
    createdAt: serverTimestamp(),
  });
}

const BLOCKED_KEY = "kokotore_blocked_users"; // string[]
const EVENT_NAME = "kokotore-blocked-changed";

async function syncRemote(update: ReturnType<typeof arrayUnion> | ReturnType<typeof arrayRemove>) {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await setDoc(doc(db, "photo_users", user.uid), { blockedUserIds: update }, { merge: true });
  } catch (e) {
    console.error("ここトレ！: ブロック一覧の同期に失敗しました", e);
  }
}

export async function blockUser(uid: string): Promise<void> {
  const list = await readJson<string[]>(BLOCKED_KEY, []);
  if (!list.includes(uid)) await writeJson(BLOCKED_KEY, [...list, uid]);
  window.dispatchEvent(new Event(EVENT_NAME));
  await syncRemote(arrayUnion(uid));
}

export async function unblockUser(uid: string): Promise<void> {
  const list = await readJson<string[]>(BLOCKED_KEY, []);
  await writeJson(BLOCKED_KEY, list.filter((u) => u !== uid));
  window.dispatchEvent(new Event(EVENT_NAME));
  await syncRemote(arrayRemove(uid));
}

// ブロック中のuid一覧をリアクティブに取得する。ログイン済みなら端末側にFirestore上の一覧をマージする。
export function useBlockedUserIds(uid?: string | null): string[] {
  const [ids, setIds] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setIds(await readJson<string[]>(BLOCKED_KEY, []));
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(EVENT_NAME, refresh);
    return () => window.removeEventListener(EVENT_NAME, refresh);
  }, [refresh]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "photo_users", uid));
        const remote: string[] = snap.data()?.blockedUserIds ?? [];
        const local = await readJson<string[]>(BLOCKED_KEY, []);
        const merged = Array.from(new Set([...local, ...remote]));
        if (!cancelled && merged.length !== local.length) {
          await writeJson(BLOCKED_KEY, merged);
          setIds(merged);
        }
      } catch (e) {
        console.error("ここトレ！: ブロック一覧の取得に失敗しました", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return ids;
}
