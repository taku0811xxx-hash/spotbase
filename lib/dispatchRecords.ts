import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";

export type Checkpoint = {
  time: string; // ISO文字列
  lat: number;
  lng: number;
  comment: string; // 例: 局発, 現場着, 撤収 など
};

export type TrackPoint = {
  time: string;
  lat: number;
  lng: number;
};

export type DispatchPhoto = {
  url: string;
  caption: string;
};

export type NoteEntry = {
  title: string;
  body: string;
};

export type EditLogEntry = {
  editedBy: string;
  editedAt: Timestamp;
  changedFields: string[]; // 変更された項目名の一覧(例: ["駐車場所", "危険箇所・注意事項"])
};

export type DispatchRecord = {
  id: string;
  locationName: string; // 場所名
  address: string; // 住所
  lat: number | null;
  lng: number | null;
  incidentType: string; // 出動内容(事件、事故など)
  parkingInfo: string; // 駐車場所
  shootingSpots: string; // 撮影ポイント
  ipTransmissionInfo: string; // 携帯回線(IP伝送)の状況
  fpuInfo: string; // FPU伝送の状況
  hazards: string; // 危険箇所・注意事項
  checkpoints: Checkpoint[];
  track: TrackPoint[]; // リアルタイム記録の軌跡
  equipmentHeaders: string[]; // 持ち出した機材表の見出し
  equipmentRows: string[][]; // 持ち出した機材表の中身
  notes: NoteEntry[]; // 記録メモ(気づいたこと、次回への注意点)
  photos: DispatchPhoto[]; // 現場写真(キャプション付き)
  organizationId: string; // 組織(NHK、日本テレビなど)
  category: string; // 分類(記者、カメラマンなど)
  recordedBy: string; // 出動者名
  history: EditLogEntry[]; // 編集履歴(誰が・いつ・何を変えたか)
  createdAt: Timestamp | null;
};

const COLLECTION = "dispatch_records";

export type NewDispatchRecordInput = {
  locationName: string;
  address: string;
  lat: number | null;
  lng: number | null;
  incidentType: string;
  parkingInfo: string;
  shootingSpots: string;
  ipTransmissionInfo: string;
  fpuInfo: string;
  hazards: string;
  checkpoints: Checkpoint[];
  track: TrackPoint[];
  equipmentHeaders: string[];
  equipmentRows: string[][];
  notes: NoteEntry[];
  photos: { file: File; caption: string }[];
  organizationId: string;
  category: string;
  recordedBy: string;
};

export async function createDispatchRecord(
  input: NewDispatchRecordInput
): Promise<string> {
  const docRef = doc(collection(db, COLLECTION));

  const photos: DispatchPhoto[] = [];
  for (const [i, { file, caption }] of input.photos.entries()) {
    const storageRef = ref(
      storage,
      `dispatch_records/${docRef.id}/${Date.now()}-${i}-${file.name}`
    );
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    photos.push({ url, caption });
  }

  await setDoc(docRef, {
    locationName: input.locationName,
    address: input.address,
    lat: input.lat,
    lng: input.lng,
    incidentType: input.incidentType,
    parkingInfo: input.parkingInfo,
    shootingSpots: input.shootingSpots,
    ipTransmissionInfo: input.ipTransmissionInfo,
    fpuInfo: input.fpuInfo,
    hazards: input.hazards,
    checkpoints: input.checkpoints,
    track: input.track,
    equipmentHeaders: input.equipmentHeaders,
    equipmentRows: input.equipmentRows,
    notes: input.notes,
    photos,
    organizationId: input.organizationId,
    category: input.category,
    recordedBy: input.recordedBy,
    history: [],
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

// 編集可能な項目とその表示名(履歴に「何が変わったか」を記録するために使う)
const EDITABLE_FIELD_LABELS: Record<string, string> = {
  locationName: "場所名",
  address: "住所",
  lat: "位置",
  lng: "位置",
  incidentType: "出動内容",
  parkingInfo: "駐車場所",
  shootingSpots: "撮影ポイント",
  ipTransmissionInfo: "携帯回線(IP伝送)の状況",
  fpuInfo: "FPU伝送の状況",
  hazards: "危険箇所・注意事項",
  notes: "記録メモ",
};

export type UpdateDispatchRecordInput = {
  locationName: string;
  address: string;
  lat: number | null;
  lng: number | null;
  incidentType: string;
  parkingInfo: string;
  shootingSpots: string;
  ipTransmissionInfo: string;
  fpuInfo: string;
  hazards: string;
  notes: NoteEntry[];
};

// 出動記録を編集する。誰でも(同じ組織・分類なら)編集できる代わりに、
// 「誰が・いつ・何を変えたか」を履歴として残す。
export async function updateDispatchRecord(
  id: string,
  input: UpdateDispatchRecordInput,
  editedBy: string
): Promise<void> {
  const existing = await getDispatchRecord(id);
  if (!existing) throw new Error("出動記録が見つかりません");

  const changedFieldKeys = Object.keys(EDITABLE_FIELD_LABELS).filter((key) => {
    if (key === "notes") {
      return JSON.stringify(existing.notes) !== JSON.stringify(input.notes);
    }
    const existingValue = (existing as unknown as Record<string, unknown>)[key];
    const newValue = (input as unknown as Record<string, unknown>)[key];
    return existingValue !== newValue;
  });

  // lat/lngは両方とも「位置」としてまとめて1件扱いにする
  const changedLabels = Array.from(
    new Set(changedFieldKeys.map((key) => EDITABLE_FIELD_LABELS[key]))
  );

  const newHistory: EditLogEntry[] = [...(existing.history ?? [])];
  if (changedLabels.length > 0) {
    newHistory.push({
      editedBy,
      editedAt: Timestamp.now(),
      changedFields: changedLabels,
    });
  }

  await updateDoc(doc(db, COLLECTION, id), {
    locationName: input.locationName,
    address: input.address,
    lat: input.lat,
    lng: input.lng,
    incidentType: input.incidentType,
    parkingInfo: input.parkingInfo,
    shootingSpots: input.shootingSpots,
    ipTransmissionInfo: input.ipTransmissionInfo,
    fpuInfo: input.fpuInfo,
    hazards: input.hazards,
    notes: input.notes,
    history: newHistory,
  });
}

// 一覧取得: Firestoreのセキュリティルール上、組織をまたぐ一覧取得はできないため、
// 必ず組織IDで絞り込む。管理者は分類を問わず、一般ユーザーは同じ分類のみ。
export async function getDispatchRecords(scope: {
  organizationId: string;
  category: string;
  isAdmin: boolean;
}): Promise<DispatchRecord[]> {
  const q = scope.isAdmin
    ? query(
        collection(db, COLLECTION),
        where("organizationId", "==", scope.organizationId)
      )
    : query(
        collection(db, COLLECTION),
        where("organizationId", "==", scope.organizationId),
        where("category", "==", scope.category)
      );
  const snap = await getDocs(q);
  const records = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<DispatchRecord, "id">),
  }));
  records.sort((a, b) => {
    const at = a.createdAt?.toMillis?.() ?? 0;
    const bt = b.createdAt?.toMillis?.() ?? 0;
    return bt - at;
  });
  return records;
}

export async function getDispatchRecord(id: string): Promise<DispatchRecord | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<DispatchRecord, "id">) };
}

export async function deleteDispatchRecord(id: string) {
  await deleteDoc(doc(db, COLLECTION, id));
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a1 = (lat1 * Math.PI) / 180;
  const a2 = (lat2 * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a1) * Math.cos(a2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 指定した現場(緯度経度)の近くで行われた過去の出動記録を検索する。
// 出動記録は現場(ピン)に直接紐づいていないため、位置の近さで判定する。
export async function getDispatchRecordsNear(
  lat: number,
  lng: number,
  scope: { organizationId: string; category: string; isAdmin: boolean },
  radiusMeters = 300
): Promise<DispatchRecord[]> {
  const all = await getDispatchRecords(scope);
  return all.filter(
    (r) => r.lat != null && r.lng != null && distanceMeters(lat, lng, r.lat, r.lng) <= radiusMeters
  );
}
