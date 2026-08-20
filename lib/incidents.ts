import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  doc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export type IncidentStatus = "unverified" | "verified" | "dismissed";
export type IncidentCategory =
  | "火災"
  | "事故"
  | "災害"
  | "通信障害"
  | "その他";
export type IncidentUrgency = "high" | "medium" | "low";

export interface Incident {
  id: string;
  organizationId: string; // 組織ごとに分離
  title: string;
  description: string;
  category: IncidentCategory;
  locationName: string;
  latitude: number;
  longitude: number;
  urgency: IncidentUrgency;
  detectedAt: Timestamp;
  status: IncidentStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  sourceText?: string; // 元の速報テキスト
}

/**
 * 組織内の未確認・高緊急度の速報事案を取得
 */
export async function getRecentIncidents(
  organizationId: string,
  maxResults: number = 10
): Promise<Incident[]> {
  const q = query(
    collection(db, "incidents"),
    where("organizationId", "==", organizationId),
    where("status", "in", ["unverified", "verified"]),
    orderBy("detectedAt", "desc"),
    limit(maxResults)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  } as Incident));
}

/**
 * 高緊急度の速報事案のみ取得（トップページ表示用）
 */
export async function getHighUrgencyIncidents(
  organizationId: string,
  maxResults: number = 5
): Promise<Incident[]> {
  const q = query(
    collection(db, "incidents"),
    where("organizationId", "==", organizationId),
    where("urgency", "==", "high"),
    where("status", "in", ["unverified", "verified"]),
    orderBy("detectedAt", "desc"),
    limit(maxResults)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  } as Incident));
}

/**
 * 新規速報事案を作成
 */
export async function createIncident(
  organizationId: string,
  data: Omit<Incident, "id" | "organizationId" | "createdAt" | "updatedAt">
): Promise<string> {
  const now = Timestamp.now();
  const docRef = await addDoc(collection(db, "incidents"), {
    organizationId,
    ...data,
    createdAt: now,
    updatedAt: now,
  });
  return docRef.id;
}

/**
 * 速報事案のステータスを更新
 */
export async function updateIncidentStatus(
  incidentId: string,
  status: IncidentStatus
): Promise<void> {
  const docRef = doc(db, "incidents", incidentId);
  await updateDoc(docRef, {
    status,
    updatedAt: Timestamp.now(),
  });
}

/**
 * 特定の速報事案を ID で取得
 */
export async function getIncident(incidentId: string): Promise<Incident | null> {
  try {
    const docRef = doc(db, "incidents", incidentId);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    return {
      id: snapshot.id,
      ...snapshot.data(),
    } as Incident;
  } catch {
    return null;
  }
}
