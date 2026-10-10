import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";

// SpotBase本体(pro)専用: 場所(pin)ごとの「過去報告書」と「対応履歴」。
// どちらもトップレベルのコレクションに置き、organizationId/categoryを持たせることで
// pinsと同じFirestoreルール(canView/isOwnOrgData)でアクセス制御する。
// 現在の実装対象はpinのみ。将来incidentへ拡張できるようtargetTypeを持たせている。
export type RecordTargetType = "pin" | "incident";

export type SpotReport = {
  id: string;
  organizationId: string;
  category: string; // 親pinのcategoryをコピー(FirestoreルールのcanView用)
  targetType: RecordTargetType;
  targetId: string;
  title: string;
  body: string; // 本文 / 文字起こしテキスト
  interviewNotes: string; // 取材メモ
  attachmentUrls: string[];
  authorUid: string;
  authorName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type ActivityStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type ActivityActionType =
  | "contact"
  | "permission"
  | "visit"
  | "coordination"
  | "report"
  | "other";

export const ACTIVITY_STATUS_META: Record<ActivityStatus, { label: string; className: string }> = {
  pending: { label: "未対応", className: "bg-gray-100 text-gray-700 border-gray-200" },
  in_progress: { label: "対応中", className: "bg-amber-50 text-amber-700 border-amber-200" },
  completed: { label: "完了", className: "bg-green-50 text-green-700 border-green-200" },
  cancelled: { label: "中止", className: "bg-red-50 text-red-700 border-red-200" },
};
export const ACTIVITY_STATUSES = Object.keys(ACTIVITY_STATUS_META) as ActivityStatus[];

export const ACTIVITY_ACTION_LABELS: Record<ActivityActionType, string> = {
  contact: "連絡・問い合わせ",
  permission: "撮影許可",
  visit: "現地訪問",
  coordination: "調整",
  report: "報告",
  other: "その他",
};
export const ACTIVITY_ACTION_TYPES = Object.keys(ACTIVITY_ACTION_LABELS) as ActivityActionType[];

export type ActivityLog = {
  id: string;
  organizationId: string;
  category: string;
  targetType: RecordTargetType;
  targetId: string;
  loggedAt: Timestamp; // 対応日時(ユーザー入力。AI要約の並べ替えキー)
  actorUid: string;
  actorName: string; // 対応者
  actionType: ActivityActionType;
  status: ActivityStatus;
  detail: string;
  interviewNotes: string; // 取材メモ
  createdByUid: string; // 登録者(編集権限の判定用。対応者とは別でもよい)
  createdAt: Timestamp;
};

// AI要約(最新情報)。pins/{id}.aiProposal.content.latestSummary にキャッシュされる
export type LatestInfoSummary = {
  currentStatus: string;
  changeSummary: string;
  fieldNotes: string;
  openItems: string[];
  basedOnLogId: string | null;
  generatedAt: string; // ISO
};

const REPORTS = "spot_reports";
const LOGS = "activity_logs";

type Scope = { organizationId: string; targetType: RecordTargetType; targetId: string };

export async function listReports(scope: Scope): Promise<SpotReport[]> {
  const snap = await getDocs(
    query(
      collection(db, REPORTS),
      where("organizationId", "==", scope.organizationId),
      where("targetId", "==", scope.targetId),
      orderBy("createdAt", "desc")
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SpotReport);
}

export async function addReport(
  input: Omit<SpotReport, "id" | "createdAt" | "updatedAt" | "attachmentUrls">,
  files: File[]
): Promise<void> {
  const urls: string[] = [];
  const folder = `spot_reports/${input.organizationId}/${input.targetId}`;
  for (let i = 0; i < files.length; i++) {
    const r = ref(storage, `${folder}/${Date.now()}-${i}-${files[i].name}`);
    await uploadBytes(r, files[i]);
    urls.push(await getDownloadURL(r));
  }
  await addDoc(collection(db, REPORTS), {
    ...input,
    attachmentUrls: urls,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

export async function updateReport(
  id: string,
  patch: Pick<SpotReport, "title" | "body" | "interviewNotes">
): Promise<void> {
  await updateDoc(doc(db, REPORTS, id), { ...patch, updatedAt: Timestamp.now() });
}

export async function listActivityLogs(scope: Scope): Promise<ActivityLog[]> {
  const snap = await getDocs(
    query(
      collection(db, LOGS),
      where("organizationId", "==", scope.organizationId),
      where("targetId", "==", scope.targetId),
      orderBy("loggedAt", "desc")
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ActivityLog);
}

export async function addActivityLog(
  input: Omit<ActivityLog, "id" | "createdAt">
): Promise<void> {
  await addDoc(collection(db, LOGS), { ...input, createdAt: Timestamp.now() });
}

// 入力ミス修正用。対象・組織・登録者は変更不可(Firestoreルールでも保証)。
export async function updateActivityLog(
  id: string,
  patch: Pick<
    ActivityLog,
    "loggedAt" | "actorName" | "actionType" | "status" | "detail" | "interviewNotes"
  >
): Promise<void> {
  await updateDoc(doc(db, LOGS, id), patch);
}
