import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { compressImage } from "./imageCompression";

export type AiProposal = {
  content: {
    shootingPositions?: Array<{
      position: string;
      direction: string;
      reason: string;
    }>;
    broadcastLocations?: {
      recommended: {
        name: string;
        lat: number;
        lng: number;
        reason: string;
        iconType: "angle" | "parking";
      };
      alternative: {
        name: string;
        lat: number;
        lng: number;
        reason: string;
        iconType: "angle" | "parking";
      };
      parking: {
        name: string;
        lat: number;
        lng: number;
        reason: string;
        iconType: "angle" | "parking";
      };
    };
    pinSummary?: {
      parkingInfo: string;
      shootingSpots: string;
      ipTransmissionInfo: string;
      fpuInfo: string;
      hazards: string;
    };
  };
  generatedAt: Timestamp;
};

export type Pin = {
  id: string;
  parentLocation?: string; // 代表地名または建物名（例: "国立競技場", "財務省"）
  name: string; // 現場名・詳細な場所・条件（例: "千駄木付近", "正面玄関前"）
  address: string; // 住所
  lat: number;
  lng: number;
  parkingInfo: string; // 駐車場所
  shootingSpots: string; // 撮影ポイント
  ipTransmissionInfo: string; // 携帯回線(IP伝送)の状況
  fpuInfo: string; // FPU伝送の状況
  signalInfo?: string; // 旧項目(電波状況)。古いデータの表示互換用
  hazards: string; // 危険箇所・注意事項
  photoUrls: string[]; // 現場全体の写真
  shootingPhotoUrls: string[]; // 撮影ポイントの写真
  hazardPhotoUrls: string[]; // 危険箇所・注意事項の写真
  organizationId: string; // 組織(NHK、日本テレビなど)
  category: string; // 分類(記者、カメラマンなど)
  recordedBy: string;
  recordedAt: Timestamp | null;
  dispatchCount?: number; // 出動回数（フロントエンドで計算される）
  aiProposal?: AiProposal; // AI生成提案のキャッシュ
};

const PINS_COLLECTION = "pins";

export type NewPinInput = Omit<
  Pin,
  | "id"
  | "photoUrls"
  | "shootingPhotoUrls"
  | "hazardPhotoUrls"
  | "recordedAt"
  | "signalInfo"
> & {
  photos: File[];
  shootingPhotos: File[];
  hazardPhotos: File[];
  parentLocation?: string;
};

async function uploadPhotos(
  pinId: string,
  folder: string,
  files: File[]
): Promise<string[]> {
  const urls: string[] = [];
  for (const [i, file] of files.entries()) {
    // クライアントサイドで画像を圧縮
    const compressedResult = await compressImage(file, {
      maxWidth: 1920,
      maxHeight: 1920,
      quality: 0.8,
      format: "webp",
      maxSizeKB: 500,
    });

    const storageRef = ref(
      storage,
      `pins/${pinId}/${folder}/${Date.now()}-${i}-${compressedResult.file.name}`
    );
    await uploadBytes(storageRef, compressedResult.file);
    urls.push(await getDownloadURL(storageRef));
  }
  return urls;
}

export async function createPin(input: NewPinInput): Promise<string> {
  const pinRef = doc(collection(db, PINS_COLLECTION));

  // 先に画像をStorageにアップロードしてURLを集める(セクションごとにフォルダを分ける)
  const photoUrls = await uploadPhotos(pinRef.id, "general", input.photos);
  const shootingPhotoUrls = await uploadPhotos(
    pinRef.id,
    "shooting",
    input.shootingPhotos
  );
  const hazardPhotoUrls = await uploadPhotos(
    pinRef.id,
    "hazard",
    input.hazardPhotos
  );

  await setDoc(pinRef, {
    parentLocation: input.parentLocation,
    name: input.name,
    address: input.address,
    lat: input.lat,
    lng: input.lng,
    parkingInfo: input.parkingInfo,
    shootingSpots: input.shootingSpots,
    ipTransmissionInfo: input.ipTransmissionInfo,
    fpuInfo: input.fpuInfo,
    hazards: input.hazards,
    photoUrls,
    shootingPhotoUrls,
    hazardPhotoUrls,
    organizationId: input.organizationId,
    category: input.category,
    recordedBy: input.recordedBy,
    recordedAt: serverTimestamp(),
  });

  return pinRef.id;
}

export type UpdatePinInput = Omit<
  NewPinInput,
  "photos" | "shootingPhotos" | "hazardPhotos"
> & {
  // 編集時は「追加する新しい写真」だけを渡す(既存の写真は維持する)
  newPhotos: File[];
  newShootingPhotos: File[];
  newHazardPhotos: File[];
};

export async function updatePin(pinId: string, input: UpdatePinInput) {
  const existing = await getPin(pinId);
  if (!existing) throw new Error("現場が見つかりません");

  const addedPhotoUrls = await uploadPhotos(pinId, "general", input.newPhotos);
  const addedShootingPhotoUrls = await uploadPhotos(
    pinId,
    "shooting",
    input.newShootingPhotos
  );
  const addedHazardPhotoUrls = await uploadPhotos(
    pinId,
    "hazard",
    input.newHazardPhotos
  );

  await updateDoc(doc(db, PINS_COLLECTION, pinId), {
    parentLocation: input.parentLocation,
    name: input.name,
    address: input.address,
    lat: input.lat,
    lng: input.lng,
    parkingInfo: input.parkingInfo,
    shootingSpots: input.shootingSpots,
    ipTransmissionInfo: input.ipTransmissionInfo,
    fpuInfo: input.fpuInfo,
    hazards: input.hazards,
    photoUrls: [...existing.photoUrls, ...addedPhotoUrls],
    shootingPhotoUrls: [
      ...existing.shootingPhotoUrls,
      ...addedShootingPhotoUrls,
    ],
    hazardPhotoUrls: [...existing.hazardPhotoUrls, ...addedHazardPhotoUrls],
  });
}

export async function deletePin(pinId: string) {
  // 写真本体(Storage)は残るが、MVP段階では削除処理は省略している。
  // 運用が本格化したらStorage側のクリーンアップも検討すること。
  await deleteDoc(doc(db, PINS_COLLECTION, pinId));
}

// 一覧取得: Firestoreのセキュリティルール上、組織をまたぐ一覧取得はできないため、
// 必ず組織IDで絞り込む。管理者は分類を問わず、一般ユーザーは同じ分類のみ。
export async function getAllPins(scope: {
  organizationId: string;
  category: string;
  isAdmin: boolean;
}): Promise<Pin[]> {
  const q = scope.isAdmin
    ? query(
        collection(db, PINS_COLLECTION),
        where("organizationId", "==", scope.organizationId)
      )
    : query(
        collection(db, PINS_COLLECTION),
        where("organizationId", "==", scope.organizationId),
        where("category", "==", scope.category)
      );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Pin, "id">) }));
}

export async function getPin(id: string): Promise<Pin | null> {
  const snap = await getDoc(doc(db, PINS_COLLECTION, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Pin, "id">) };
}

// 地名・住所・現場名でのシンプルな部分一致検索(クライアント側フィルタ)
export function searchPins(pins: Pin[], query: string): Pin[] {
  const q = query.trim().toLowerCase();
  if (!q) return pins;
  return pins.filter(
    (p) =>
      p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q)
  );
}
