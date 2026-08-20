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

export type SectionPhotos = {
  url: string;
  caption?: string;
}[];

export type NoteEntry = {
  title: string;
  body: string;
};

export type EditLogEntry = {
  editedBy: string;
  editedAt: Timestamp;
  changedFields: string[]; // 変更された項目名の一覧(例: ["駐車場所", "危険箇所・注意事項"])
};

export type Memo = {
  timestamp: string | Timestamp; // ISO 8601 or Firestore Timestamp
  text: string; // メモテキスト
};

export type DispatchRecord = {
  id: string;
  locationName: string; // 場所名
  address: string; // 住所
  lat: number | null;
  lng: number | null;
  incidentType: string; // 出動内容(事件、事故など)
  parkingInfo: string; // 駐車場所
  parkingPhotos?: SectionPhotos; // 駐車場所の写真
  shootingSpots: string; // 撮影ポイント
  shootingPhotos?: SectionPhotos; // 撮影ポイントの写真
  ipTransmissionInfo: string; // 携帯回線(IP伝送)の状況
  ipTransmissionPhotos?: SectionPhotos; // IP伝送の写真
  fpuInfo: string; // FPU伝送の状況
  fpuPhotos?: SectionPhotos; // FPU伝送の写真
  hazards: string; // 危険箇所・注意事項
  hazardPhotos?: SectionPhotos; // 危険箇所の写真
  siteInfo?: string; // 現場情報(新規項目)
  sitePhotos?: SectionPhotos; // 現場情報の写真
  checkpoints: Checkpoint[];
  track: TrackPoint[]; // リアルタイム記録の軌跡
  equipmentHeaders: string[]; // 持ち出した機材表の見出し
  equipmentRows: string[][]; // 持ち出した機材表の中身
  notes: NoteEntry[]; // 記録メモ(気づいたこと、次回への注意点)
  photos: DispatchPhoto[]; // 現場写真(キャプション付き)
  organizationId: string; // 組織(NHK、日本テレビなど)
  category: string; // 分類(記者、カメラマンなど)
  recordedBy: string; // 出動者名
  createdBy?: string; // 作成者名（現場アクティブ管理用）
  status: 'draft' | 'published' | '準備中' | '移動中' | '現場対応中' | '完了'; // ステータス
  draftSavedAt?: Timestamp | null; // 下書き保存日時
  publishedAt?: Timestamp | null; // 正式提出日時
  history: EditLogEntry[]; // 編集履歴(誰が・いつ・何を変えたか)
  createdAt: Timestamp | null;
  memos?: Memo[]; // リアルタイム現場メモ（FPU回線確保、中継車設営完了など）
  sourceFileHash?: string; // インポート時のソースファイルハッシュ（重複防止用）
};

const COLLECTION = "dispatch_records";

export type NewDispatchRecordInput = {
  locationName: string;
  address: string;
  lat: number | null;
  lng: number | null;
  incidentType: string;
  siteInfo?: string;
  sitePhotos?: { file: File; caption?: string }[];
  parkingInfo: string;
  parkingPhotos?: { file: File; caption?: string }[];
  shootingSpots: string;
  shootingPhotos?: { file: File; caption?: string }[];
  ipTransmissionInfo: string;
  ipTransmissionPhotos?: { file: File; caption?: string }[];
  fpuInfo: string;
  fpuPhotos?: { file: File; caption?: string }[];
  hazards: string;
  hazardPhotos?: { file: File; caption?: string }[];
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

async function uploadSectionPhotos(
  recordId: string,
  category: string,
  files: { file: File; caption?: string }[]
): Promise<SectionPhotos> {
  const result: SectionPhotos = [];
  for (const [i, { file, caption }] of files.entries()) {
    const storageRef = ref(
      storage,
      `dispatch_records/${recordId}/${category}/${Date.now()}-${i}-${file.name}`
    );
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    result.push({ url, caption: caption || "" });
  }
  return result;
}

export async function createDispatchRecord(
  input: NewDispatchRecordInput
): Promise<string> {
  const docRef = doc(collection(db, COLLECTION));

  // 汎用の現場写真をアップロード
  const photos: DispatchPhoto[] = [];
  for (const [i, { file, caption }] of input.photos.entries()) {
    const storageRef = ref(
      storage,
      `dispatch_records/${docRef.id}/general/${Date.now()}-${i}-${file.name}`
    );
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    photos.push({ url, caption });
  }

  // 各セクション別の写真をアップロード
  const sitePhotos = input.sitePhotos?.length
    ? await uploadSectionPhotos(docRef.id, "site", input.sitePhotos)
    : undefined;
  const parkingPhotos = input.parkingPhotos?.length
    ? await uploadSectionPhotos(docRef.id, "parking", input.parkingPhotos)
    : undefined;
  const shootingPhotos = input.shootingPhotos?.length
    ? await uploadSectionPhotos(docRef.id, "shooting", input.shootingPhotos)
    : undefined;
  const ipTransmissionPhotos = input.ipTransmissionPhotos?.length
    ? await uploadSectionPhotos(docRef.id, "ip_transmission", input.ipTransmissionPhotos)
    : undefined;
  const fpuPhotos = input.fpuPhotos?.length
    ? await uploadSectionPhotos(docRef.id, "fpu", input.fpuPhotos)
    : undefined;
  const hazardPhotos = input.hazardPhotos?.length
    ? await uploadSectionPhotos(docRef.id, "hazards", input.hazardPhotos)
    : undefined;

  await setDoc(docRef, {
    locationName: input.locationName,
    address: input.address,
    lat: input.lat,
    lng: input.lng,
    incidentType: input.incidentType,
    siteInfo: input.siteInfo,
    sitePhotos,
    parkingInfo: input.parkingInfo,
    parkingPhotos,
    shootingSpots: input.shootingSpots,
    shootingPhotos,
    ipTransmissionInfo: input.ipTransmissionInfo,
    ipTransmissionPhotos,
    fpuInfo: input.fpuInfo,
    fpuPhotos,
    hazards: input.hazards,
    hazardPhotos,
    checkpoints: input.checkpoints,
    track: input.track,
    equipmentHeaders: input.equipmentHeaders,
    equipmentRows: input.equipmentRows,
    notes: input.notes,
    photos,
    organizationId: input.organizationId,
    category: input.category,
    recordedBy: input.recordedBy,
    status: 'draft',
    draftSavedAt: serverTimestamp(),
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
  siteInfo?: string;
  parkingInfo: string;
  shootingSpots: string;
  ipTransmissionInfo: string;
  fpuInfo: string;
  hazards: string;
  notes: NoteEntry[];
  // 写真は編集ページから個別に管理される可能性があるため、入力型には含めない
  // 必要に応じて別途アップロード関数を呼び出す
};

// 出動記録を編集する。誰でも(同じ組織・分類なら)編集できる代わりに、
// 「誰が・いつ・何を変えたか」を履歴として残す。
export async function updateDispatchRecord(
  id: string,
  input: UpdateDispatchRecordInput,
  editedBy: string,
  sectionPhotos?: {
    site?: { file: File; caption?: string }[];
    parking?: { file: File; caption?: string }[];
    shooting?: { file: File; caption?: string }[];
    ipTransmission?: { file: File; caption?: string }[];
    fpu?: { file: File; caption?: string }[];
    hazards?: { file: File; caption?: string }[];
  }
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

  // 写真の更新
  const updateData: Record<string, unknown> = {
    locationName: input.locationName,
    address: input.address,
    lat: input.lat,
    lng: input.lng,
    incidentType: input.incidentType,
    siteInfo: input.siteInfo,
    parkingInfo: input.parkingInfo,
    shootingSpots: input.shootingSpots,
    ipTransmissionInfo: input.ipTransmissionInfo,
    fpuInfo: input.fpuInfo,
    hazards: input.hazards,
    notes: input.notes,
    history: newHistory,
  };

  if (sectionPhotos?.site?.length) {
    updateData.sitePhotos = await uploadSectionPhotos(id, "site", sectionPhotos.site);
  }
  if (sectionPhotos?.parking?.length) {
    updateData.parkingPhotos = await uploadSectionPhotos(id, "parking", sectionPhotos.parking);
  }
  if (sectionPhotos?.shooting?.length) {
    updateData.shootingPhotos = await uploadSectionPhotos(id, "shooting", sectionPhotos.shooting);
  }
  if (sectionPhotos?.ipTransmission?.length) {
    updateData.ipTransmissionPhotos = await uploadSectionPhotos(id, "ip_transmission", sectionPhotos.ipTransmission);
  }
  if (sectionPhotos?.fpu?.length) {
    updateData.fpuPhotos = await uploadSectionPhotos(id, "fpu", sectionPhotos.fpu);
  }
  if (sectionPhotos?.hazards?.length) {
    updateData.hazardPhotos = await uploadSectionPhotos(id, "hazards", sectionPhotos.hazards);
  }

  await updateDoc(doc(db, COLLECTION, id), updateData);
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

// 下書きを取得
export async function getDraftRecords(scope: {
  organizationId: string;
  category: string;
  isAdmin: boolean;
}): Promise<DispatchRecord[]> {
  const q = scope.isAdmin
    ? query(
        collection(db, COLLECTION),
        where("organizationId", "==", scope.organizationId),
        where("status", "==", "draft")
      )
    : query(
        collection(db, COLLECTION),
        where("organizationId", "==", scope.organizationId),
        where("category", "==", scope.category),
        where("status", "==", "draft")
      );
  const snap = await getDocs(q);
  const records = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<DispatchRecord, "id">),
  }));
  records.sort((a, b) => {
    const at = a.draftSavedAt?.toMillis?.() ?? 0;
    const bt = b.draftSavedAt?.toMillis?.() ?? 0;
    return bt - at;
  });
  return records;
}

// 下書きを公開（status を 'published' に変更）
export async function publishDraftRecord(id: string): Promise<void> {
  const existing = await getDispatchRecord(id);
  if (!existing) throw new Error("出動記録が見つかりません");
  if (existing.status === "published") throw new Error("既に公開済みです");

  await updateDoc(doc(db, COLLECTION, id), {
    status: "published",
    publishedAt: serverTimestamp(),
  });
}

// 下書きを保存（新規または既存の下書きを更新）
// 下書き専用作成関数: 写真はアップロードしない
async function createDraftRecord(
  input: NewDispatchRecordInput
): Promise<string> {
  const docRef = doc(collection(db, COLLECTION));

  // undefined フィールドを除外する
  const data: Record<string, unknown> = {
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
    checkpoints: input.checkpoints || [],
    track: input.track || [],
    equipmentHeaders: input.equipmentHeaders || [],
    equipmentRows: input.equipmentRows || [],
    notes: input.notes || [],
    photos: [],
    organizationId: input.organizationId,
    category: input.category,
    recordedBy: input.recordedBy,
    status: 'draft',
    draftSavedAt: serverTimestamp(),
    history: [],
    createdAt: serverTimestamp(),
  };

  // オプショナルフィールドは undefined でなければ追加
  if (input.siteInfo !== undefined) data.siteInfo = input.siteInfo;

  await setDoc(docRef, data);
  return docRef.id;
}

export async function saveDraft(
  input: NewDispatchRecordInput,
  recordId?: string
): Promise<string> {
  // 下書きは当面 Firestore には保存せず、呼び出し側（フロントエンド）で IndexedDB に保存する
  // 理由：写真ファイルオブジェクトはFirestoreに保存できないため
  // フロントエンドで下書きをIndexedDBに保存し、正式提出時に Firestore に写真をアップロード

  if (recordId) {
    // 既存下書きの更新: Firestore に保存済みのレコードを編集する場合
    const existing = await getDispatchRecord(recordId);
    if (!existing) throw new Error("出動記録が見つかりません");

    const updateData: Record<string, unknown> = {
      locationName: input.locationName,
      address: input.address,
      lat: input.lat,
      lng: input.lng,
      incidentType: input.incidentType,
      siteInfo: input.siteInfo,
      parkingInfo: input.parkingInfo,
      shootingSpots: input.shootingSpots,
      ipTransmissionInfo: input.ipTransmissionInfo,
      fpuInfo: input.fpuInfo,
      hazards: input.hazards,
      notes: input.notes,
      draftSavedAt: serverTimestamp(),
    };

    await updateDoc(doc(db, COLLECTION, recordId), updateData);
    return recordId;
  } else {
    // 新規下書き作成: ID を生成して返す（実際の保存はフロントエンド側で IndexedDB に）
    const docRef = doc(collection(db, COLLECTION));
    return docRef.id;
  }
}

// 下書きを公開する（status を 'draft' から 'published' に変更）
export async function publishDispatchRecord(
  id: string,
  scope: { organizationId: string; category: string; isAdmin: boolean }
): Promise<void> {
  const existing = await getDispatchRecord(id);
  if (!existing) throw new Error("出動記録が見つかりません");
  if (existing.status === "published") throw new Error("既に公開済みです");

  // status を 'published' に更新
  await updateDoc(doc(db, COLLECTION, id), {
    status: "published",
    publishedAt: serverTimestamp(),
  });

  // pinSync を実行して現場記録を自動生成・更新
  const { syncPinFromDispatch } = await import("./pinSync");
  if (existing.lat != null && existing.lng != null) {
    await syncPinFromDispatch(
      {
        locationName: existing.locationName,
        address: existing.address,
        lat: existing.lat,
        lng: existing.lng,
        organizationId: existing.organizationId,
        category: existing.category,
        recordedBy: existing.recordedBy,
      },
      scope
    );
  }
}

// クライアント側でのフィルタリング用関数
export function filterDispatchRecords(
  records: DispatchRecord[],
  filters: {
    keyword?: string;
    startDate?: Date;
    endDate?: Date;
    sortBy?: "newest" | "oldest";
  }
): DispatchRecord[] {
  let filtered = [...records];

  // キーワード検索（場所名・住所・出動者名・記録メモを横断検索）
  if (filters.keyword?.trim()) {
    const keyword = filters.keyword.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.locationName.toLowerCase().includes(keyword) ||
        r.address.toLowerCase().includes(keyword) ||
        r.recordedBy.toLowerCase().includes(keyword) ||
        r.notes?.some((n) => n.body.toLowerCase().includes(keyword)) ||
        r.notes?.some((n) => n.title.toLowerCase().includes(keyword))
    );
  }

  // 日付範囲フィルター
  if (filters.startDate) {
    filtered = filtered.filter((r) => {
      const recordDate = r.createdAt?.toDate?.();
      return recordDate && recordDate >= filters.startDate!;
    });
  }

  if (filters.endDate) {
    const endOfDay = new Date(filters.endDate);
    endOfDay.setHours(23, 59, 59, 999);
    filtered = filtered.filter((r) => {
      const recordDate = r.createdAt?.toDate?.();
      return recordDate && recordDate <= endOfDay;
    });
  }

  // 並び替え
  if (filters.sortBy === "oldest") {
    filtered.sort((a, b) => {
      const at = a.createdAt?.toMillis?.() ?? 0;
      const bt = b.createdAt?.toMillis?.() ?? 0;
      return at - bt;
    });
  } else {
    // デフォルトは最新順
    filtered.sort((a, b) => {
      const at = a.createdAt?.toMillis?.() ?? 0;
      const bt = b.createdAt?.toMillis?.() ?? 0;
      return bt - at;
    });
  }

  return filtered;
}

// 組織別に全出動記録を取得
export async function getDispatchRecordsByOrganization(
  organizationId: string
): Promise<DispatchRecord[]> {
  const q = query(collection(db, COLLECTION), where("organizationId", "==", organizationId));
  const snap = await getDocs(q);
  const records = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<DispatchRecord, "id">),
  }));
  // 最新順でソート
  records.sort((a, b) => {
    const at = a.createdAt?.toMillis?.() ?? 0;
    const bt = b.createdAt?.toMillis?.() ?? 0;
    return bt - at;
  });
  return records;
}
