import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  writeBatch,
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

// 現場記録: ロケや中継のたびに作る日付単位の取材記録。報告書と対応履歴はこの下に積まれる。
// 親はpin(pinId)。報告書/対応履歴側は targetId(=pinId) と fieldRecordId の両方を持つ。
export type FieldRecordSource = "manual" | "report_import";
export type FieldRecord = {
  id: string;
  organizationId: string;
  category: string; // 親pinのcategoryをコピー(FirestoreルールのcanView用)
  pinId: string;
  recordDate: Timestamp; // 取材日(並び順・AI時系列のキー)
  title: string; // 例: "2026/10/10 初回現地ロケ"
  interviewNotes: string;
  source: FieldRecordSource;
  authorUid: string;
  authorName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type SpotReport = {
  id: string;
  organizationId: string;
  category: string; // 親pinのcategoryをコピー(FirestoreルールのcanView用)
  targetType: RecordTargetType;
  targetId: string;
  fieldRecordId?: string; // 所属する現場記録(旧データは未設定)
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
  fieldRecordId?: string; // 所属する現場記録(旧データは未設定)
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

const FIELD_RECORDS = "field_records";
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

async function uploadReportFiles(
  organizationId: string,
  pinId: string,
  files: File[]
): Promise<string[]> {
  const urls: string[] = [];
  const folder = `spot_reports/${organizationId}/${pinId}`;
  for (let i = 0; i < files.length; i++) {
    const r = ref(storage, `${folder}/${Date.now()}-${i}-${files[i].name}`);
    await uploadBytes(r, files[i]);
    urls.push(await getDownloadURL(r));
  }
  return urls;
}

export async function addReport(
  input: Omit<SpotReport, "id" | "createdAt" | "updatedAt" | "attachmentUrls">,
  files: File[]
): Promise<void> {
  const urls = await uploadReportFiles(input.organizationId, input.targetId, files);
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

export async function listFieldRecords(pinId: string, organizationId: string): Promise<FieldRecord[]> {
  const snap = await getDocs(
    query(
      collection(db, FIELD_RECORDS),
      where("organizationId", "==", organizationId),
      where("pinId", "==", pinId),
      orderBy("recordDate", "desc")
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as FieldRecord);
}

// 入力ミス修正用。作成者本人またはadminのみ(Firestoreルールでも保証)。
export async function updateFieldRecord(
  id: string,
  patch: Pick<FieldRecord, "recordDate" | "title" | "interviewNotes">
): Promise<void> {
  await updateDoc(doc(db, FIELD_RECORDS, id), { ...patch, updatedAt: Timestamp.now() });
}

export type NewFieldRecordInput = {
  pin: { id: string; organizationId: string; category: string };
  user: { uid: string; name: string };
  recordDate: Date;
  title: string;
  interviewNotes: string;
  source: FieldRecordSource;
  // 手入力 / 報告書読み込みのどちらでも、対応内容があれば対応履歴を1件作る
  activity?: {
    actorName: string;
    actionType: ActivityActionType;
    status: ActivityStatus;
    detail: string;
  };
  // 報告書読み込み時: 本文貼り付けと添付ファイル(PDF/画像)
  report?: { title: string; body: string; files: File[] };
};

// 現場記録と、それに紐づく対応履歴/報告書を1回のバッチで作成する(添付のアップロードは先に行う)。
export async function createFieldRecord(input: NewFieldRecordInput): Promise<string> {
  const { pin, user } = input;
  const base = {
    organizationId: pin.organizationId,
    category: pin.category,
  };
  const now = Timestamp.now();
  const recordRef = doc(collection(db, FIELD_RECORDS));
  const urls = input.report
    ? await uploadReportFiles(pin.organizationId, pin.id, input.report.files)
    : [];

  const batch = writeBatch(db);
  batch.set(recordRef, {
    ...base,
    pinId: pin.id,
    recordDate: Timestamp.fromDate(input.recordDate),
    title: input.title,
    interviewNotes: input.interviewNotes,
    source: input.source,
    authorUid: user.uid,
    authorName: user.name,
    createdAt: now,
    updatedAt: now,
  });
  const target = { targetType: "pin" as const, targetId: pin.id, fieldRecordId: recordRef.id };
  if (input.activity) {
    batch.set(doc(collection(db, LOGS)), {
      ...base,
      ...target,
      loggedAt: Timestamp.fromDate(input.recordDate),
      actorUid: user.uid,
      actorName: input.activity.actorName || user.name,
      actionType: input.activity.actionType,
      status: input.activity.status,
      detail: input.activity.detail,
      interviewNotes: "",
      createdByUid: user.uid,
      createdAt: now,
    });
  }
  if (input.report) {
    batch.set(doc(collection(db, REPORTS)), {
      ...base,
      ...target,
      title: input.report.title,
      body: input.report.body,
      interviewNotes: "",
      attachmentUrls: urls,
      authorUid: user.uid,
      authorName: user.name,
      createdAt: now,
      updatedAt: now,
    });
  }
  await batch.commit();
  return recordRef.id;
}
