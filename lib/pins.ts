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

// 図面(配置図・見取り図等)ファイル1件分。アップロードするたびに配列へ追加され、
// 過去の図面も履歴として残り続ける(削除しない限り消えない)。
export type PinDrawing = {
  id: string;
  url: string;
  fileName: string;
  uploadedAt: Timestamp;
  uploadedBy: string;
  isLatest: boolean; // drawings配列中でuploadedAtが最も新しい1件のみtrue
};

// ユーザーが自由なタイトルで追加できるカスタム項目(キー・値のセット)。
// field_notes側のFieldNoteCustomField(lib/fieldNotes.ts)と同じ形だが、
// pins.tsはfieldNotes.tsに依存しない構成のため、あえて同一の型として別定義している。
export type PinCustomField = {
  key: string;
  value: string;
};

// 写真のEXIF情報(撮影機材・撮影条件)。「散歩・Vlogアプリ」「フォトスポット共有アプリ」等、
// 写真そのものが主役になる派生プロダクトで使う想定のオプショナル項目。
// SpotBase本体では現状未使用(常にundefined)だが、Pin型に持たせておくことで
// 派生プロダクト側は型定義を分岐させずにそのままPinを扱える。
export type PinExif = {
  camera?: string; // 例: "SONY α7 IV"
  lens?: string; // 例: "FE 24-70mm F2.8 GM"
  fNumber?: number; // 絞り値(F値)
  iso?: number;
  exposureTime?: string; // 例: "1/250"
  shotAt?: Timestamp; // 撮影日時(EXIF由来。recordedAtは「SpotBaseへの登録日時」なので別途持つ)
};

export type Pin = {
  id: string;
  parentLocation?: string; // 代表地名または建物名（例: "国立競技場", "財務省"）
  name: string; // 現場名・詳細な場所・条件（例: "千駄木付近", "正面玄関前"）
  referenceId?: string; // 管理ID・参照番号(例: "LOC-2026-0101"。現場記録フォームの採番と同じ形式)
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
  parkingPhotoUrls: string[]; // 駐車場所の写真
  shootingPhotoUrls: string[]; // 撮影ポイントの写真
  hazardPhotoUrls: string[]; // 危険箇所・注意事項の写真
  drawings?: PinDrawing[]; // 図面(配置図等、PDF/画像)のアップロード履歴
  customFields?: PinCustomField[]; // ユーザーが自由なタイトルで追加したカスタム項目
  exif?: PinExif; // 写真のEXIF情報(散歩・フォトスポット系の派生プロダクト向け、SpotBase本体では未使用)
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
  | "parkingPhotoUrls"
  | "shootingPhotoUrls"
  | "hazardPhotoUrls"
  | "drawings"
  | "recordedAt"
  | "signalInfo"
> & {
  photos: File[];
  parkingPhotos: File[];
  shootingPhotos: File[];
  hazardPhotos: File[];
  drawings: File[];
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

// 図面(PDF/画像)をStorageにアップロードする。写真と異なり、PDFは画像圧縮の
// 対象外(compressImageは画像専用)なので、拡張子で分岐してそのままアップロードする。
async function uploadDrawings(
  pinId: string,
  files: File[],
  uploadedBy: string
): Promise<PinDrawing[]> {
  const uploaded: PinDrawing[] = [];
  for (const [i, file] of files.entries()) {
    const isImage = file.type.startsWith("image/");
    const uploadFile = isImage
      ? (
          await compressImage(file, {
            maxWidth: 2400,
            maxHeight: 2400,
            quality: 0.85,
            format: "webp",
            maxSizeKB: 2000,
          })
        ).file
      : file;

    const storageRef = ref(
      storage,
      `pins/${pinId}/drawings/${Date.now()}-${i}-${uploadFile.name}`
    );
    await uploadBytes(storageRef, uploadFile);
    const url = await getDownloadURL(storageRef);
    uploaded.push({
      id: storageRef.name,
      url,
      fileName: file.name,
      uploadedAt: Timestamp.now(),
      uploadedBy,
      isLatest: false, // 最終的な最新フラグはmergeDrawingsで付け直す
    });
  }
  return uploaded;
}

// 既存の図面履歴に新規アップロード分を足し、uploadedAtが最も新しい1件だけを
// isLatest: trueに付け直す(履歴は削除せず全件保持する)。
function mergeDrawings(
  existing: PinDrawing[],
  added: PinDrawing[]
): PinDrawing[] {
  const merged = [...existing, ...added];
  if (merged.length === 0) return merged;
  const latest = merged.reduce((a, b) =>
    b.uploadedAt.toMillis() > a.uploadedAt.toMillis() ? b : a
  );
  return merged.map((d) => ({ ...d, isLatest: d.id === latest.id }));
}

export async function createPin(input: NewPinInput): Promise<string> {
  const pinRef = doc(collection(db, PINS_COLLECTION));

  // 先に画像をStorageにアップロードしてURLを集める(セクションごとにフォルダを分ける)
  const photoUrls = await uploadPhotos(pinRef.id, "general", input.photos);
  const parkingPhotoUrls = await uploadPhotos(
    pinRef.id,
    "parking",
    input.parkingPhotos
  );
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
  const drawings = mergeDrawings(
    [],
    await uploadDrawings(pinRef.id, input.drawings, input.recordedBy)
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
    parkingPhotoUrls,
    shootingPhotoUrls,
    hazardPhotoUrls,
    drawings,
    organizationId: input.organizationId,
    category: input.category,
    recordedBy: input.recordedBy,
    recordedAt: serverTimestamp(),
  });

  return pinRef.id;
}

export type QuickPinInput = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  organizationId: string;
  category: string;
  recordedBy: string;
};

// 「新規出動」フローで、既存の現場一覧に該当がない場合にその場で現場を
// 登録するための簡易版。詳細情報(駐車場所・撮影ポイント等)は空欄で作成し、
// 後から現場詳細ページで補足入力できる。
export async function createQuickPin(input: QuickPinInput): Promise<string> {
  const pinRef = doc(collection(db, PINS_COLLECTION));
  await setDoc(pinRef, {
    name: input.name,
    address: input.address,
    lat: input.lat,
    lng: input.lng,
    parkingInfo: "",
    shootingSpots: "",
    ipTransmissionInfo: "",
    fpuInfo: "",
    hazards: "",
    photoUrls: [],
    parkingPhotoUrls: [],
    shootingPhotoUrls: [],
    hazardPhotoUrls: [],
    organizationId: input.organizationId,
    category: input.category,
    recordedBy: input.recordedBy,
    recordedAt: serverTimestamp(),
  });
  return pinRef.id;
}

// 注意: 「ここトレ！」(APP_MODE === 'photo')向けの新規スポット投稿は、
// このファイル(pro向け"pins"コレクション)ではなく lib/photoSpots.ts
// ("photo_spots"コレクション)で完全に分離して扱う。データ混同を防ぐため、
// pins.ts側にphotoモード専用の入出力は一切持たせない。

export type UpdatePinInput = Omit<
  NewPinInput,
  "photos" | "parkingPhotos" | "shootingPhotos" | "hazardPhotos" | "drawings"
> & {
  // 編集時は「追加する新しい写真/図面」だけを渡す(既存分は維持する)
  newPhotos: File[];
  newParkingPhotos: File[];
  newShootingPhotos: File[];
  newHazardPhotos: File[];
  newDrawings: File[];
};

export async function updatePin(pinId: string, input: UpdatePinInput) {
  const existing = await getPin(pinId);
  if (!existing) throw new Error("現場が見つかりません");

  const addedPhotoUrls = await uploadPhotos(pinId, "general", input.newPhotos);
  const addedParkingPhotoUrls = await uploadPhotos(
    pinId,
    "parking",
    input.newParkingPhotos
  );
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
  const addedDrawings = await uploadDrawings(
    pinId,
    input.newDrawings,
    input.recordedBy
  );
  const drawings = mergeDrawings(existing.drawings ?? [], addedDrawings);

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
    parkingPhotoUrls: [
      ...(existing.parkingPhotoUrls ?? []),
      ...addedParkingPhotoUrls,
    ],
    shootingPhotoUrls: [
      ...existing.shootingPhotoUrls,
      ...addedShootingPhotoUrls,
    ],
    hazardPhotoUrls: [...existing.hazardPhotoUrls, ...addedHazardPhotoUrls],
    drawings,
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

// 地図画面の「絞り込み」パネルでよく使われそうなキーワードのプリセット。
// 構造化されたタグフィールドをPinが持っていないため、後述のbuildSearchableText()で
// 組み立てたテキスト全体に対する部分一致で判定する(=現場情報の文中に
// その単語が含まれていれば該当、という簡易な実装)。
export const PIN_FILTER_KEYWORD_OPTIONS = [
  "屋外ロケ",
  "スタジオ",
  "電源あり",
  "5G良好",
  "Wi-Fi",
];

export type PinUpdatedWithin = "all" | "7d" | "30d" | "365d";

export type PinAttributeFilters = {
  keywords: string[]; // 選択中のキーワード(すべてを含む現場だけに絞り込む=AND条件)
  hasDrawings: boolean; // trueの場合、図面(drawings)が1件以上ある現場のみ
  updatedWithin: PinUpdatedWithin; // 最終更新日(recordedAt)の範囲
};

export const DEFAULT_PIN_ATTRIBUTE_FILTERS: PinAttributeFilters = {
  keywords: [],
  hasDrawings: false,
  updatedWithin: "all",
};

// キーワード検索対象のテキストをPinの主要項目から組み立てる。
function buildPinSearchableText(pin: Pin): string {
  return [
    pin.name,
    pin.address,
    pin.parkingInfo,
    pin.shootingSpots,
    pin.ipTransmissionInfo,
    pin.fpuInfo,
    pin.hazards,
    ...(pin.customFields ?? []).flatMap((f) => [f.key, f.value]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const UPDATED_WITHIN_MS: Record<Exclude<PinUpdatedWithin, "all">, number> = {
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "365d": 365 * 24 * 60 * 60 * 1000,
};

// フリーワード検索(searchPins)とは別枠の「属性絞り込み」。
// キーワード(タグ的なもの)・図面有無・最終更新日の3条件をAND評価する。
export function filterPinsByAttributes(
  pins: Pin[],
  filters: PinAttributeFilters
): Pin[] {
  const windowMs =
    filters.updatedWithin === "all" ? null : UPDATED_WITHIN_MS[filters.updatedWithin];
  const now = Date.now();

  return pins.filter((pin) => {
    if (filters.hasDrawings && (!pin.drawings || pin.drawings.length === 0)) {
      return false;
    }

    if (windowMs !== null) {
      const recordedMs = pin.recordedAt?.toMillis?.();
      if (recordedMs === undefined || now - recordedMs > windowMs) return false;
    }

    if (filters.keywords.length > 0) {
      const text = buildPinSearchableText(pin);
      if (!filters.keywords.every((kw) => text.includes(kw.toLowerCase()))) {
        return false;
      }
    }

    return true;
  });
}
