import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

// 現場クルーが地図上に投稿する一次情報(通行止め・注意・現場コメント等)。
// pinsのような詳細な現場情報とは別に、「今この瞬間」の速報的なメモを
// 軽量に共有するための機能。復旧(resolved)になったものは地図上から消える。
export type FieldNoteCategory = "closure" | "warning" | "memo";
export type FieldNoteStatus = "active" | "resolved";

// カテゴリごとの表示情報(絵文字・日本語ラベル・アイコン色)を一箇所に集約し、
// フォーム/マップアイコン/一覧パネルの間で表示がズレないようにする。
export const FIELD_NOTE_CATEGORY_META: Record<
  FieldNoteCategory,
  { label: string; emoji: string; color: string }
> = {
  closure: { label: "通行止め", emoji: "⛔", color: "#dc2626" },
  warning: { label: "現場注意", emoji: "⚠️", color: "#f59e0b" },
  memo: { label: "現場コメント", emoji: "💬", color: "#0ea5e9" },
};

export const FIELD_NOTE_CATEGORIES: FieldNoteCategory[] = ["closure", "warning", "memo"];

export type FieldNote = {
  id: string;
  organizationId: string; // 組織ごとに分離(他組織からは見えない)
  authorUid: string;
  authorName: string;
  category: FieldNoteCategory;
  comment: string;
  lat: number;
  lng: number;
  status: FieldNoteStatus;
  createdAt: Timestamp;
  resolvedAt: Timestamp | null;
  resolvedByUid: string | null;
};

const COLLECTION = "field_notes";

export type NewFieldNoteInput = {
  organizationId: string;
  authorUid: string;
  authorName: string;
  category: FieldNoteCategory;
  comment: string;
  lat: number;
  lng: number;
};

/**
 * 組織内のfield_notesをリアルタイム購読する。
 * 復旧済み(resolved)のものは一覧から即座に消えるよう、activeのみ取得する。
 */
export function subscribeActiveFieldNotes(
  organizationId: string,
  onChange: (notes: FieldNote[]) => void,
  onError?: (error: unknown) => void
): () => void {
  const q = query(
    collection(db, COLLECTION),
    where("organizationId", "==", organizationId),
    where("status", "==", "active"),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const notes = snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() } as FieldNote)
      );
      onChange(notes);
    },
    (error) => {
      console.error("[fieldNotes] subscribe failed:", error);
      onError?.(error);
    }
  );
}

/**
 * 新規のfield_note(通行止め・現場コメント)を投稿する。
 */
export async function createFieldNote(
  input: NewFieldNoteInput
): Promise<string> {
  const docRef = await addDoc(collection(db, COLLECTION), {
    organizationId: input.organizationId,
    authorUid: input.authorUid,
    authorName: input.authorName,
    category: input.category,
    comment: input.comment,
    lat: input.lat,
    lng: input.lng,
    status: "active" as FieldNoteStatus,
    createdAt: Timestamp.now(),
    resolvedAt: null,
    resolvedByUid: null,
  });
  return docRef.id;
}

/**
 * field_noteを「復旧済み」にする。
 */
export async function resolveFieldNote(
  fieldNoteId: string,
  resolvedByUid: string
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, fieldNoteId), {
    status: "resolved" as FieldNoteStatus,
    resolvedAt: Timestamp.now(),
    resolvedByUid,
  });
}

/**
 * Firestore Timestampを「3分前」のような相対表示に変換する。
 */
export function formatFieldNoteRelativeTime(ts: Timestamp | null | undefined): string {
  if (!ts) return "不明";
  const diffMs = Date.now() - ts.toDate().getTime();
  if (diffMs < 60_000) return "たった今";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}
