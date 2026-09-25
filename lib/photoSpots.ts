// 「ここトレ！」(APP_MODE === 'photo')専用のデータアクセス層。
// SpotBase本体のlib/pins.ts("pins"コレクション)とは別の"photo_spots"コレクションを
// 参照する。photoモードのコードはこのファイルのみを通じてデータを読み書きし、
// pro向けのlib/pins.tsには一切依存しない(データソースレベルでの分離)。
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { compressImage } from "./imageCompression";
import type {
  PhotoSpot,
  PhotoSpotCameraGear,
  PhotoSpotEquipmentTag,
  PhotoSpotExif,
  PhotoSpotLicenseType,
  PhotoSpotSubjectTag,
} from "./types/photoSpot";
import { DUMMY_PHOTO_SPOTS } from "./dummyPhotoSpots";

const PHOTO_SPOTS_COLLECTION = "photo_spots";

export type NewPhotoSpotInput = {
  name: string;
  description?: string;
  address: string;
  lat: number;
  lng: number;
  photos: File[];
  cameraGear?: PhotoSpotCameraGear;
  exif?: PhotoSpotExif;
  accessNote?: string;
  subjectTags?: PhotoSpotSubjectTag[];
  equipmentTags?: PhotoSpotEquipmentTag[];
  isFree?: boolean; // 無料ダウンロードを許可するか
  allowCommercial?: boolean; // 商用利用を許可するか
  postedBy: string; // 投稿者のuid(photo_users)。firestore.rulesの本人判定に使う
  postedByName?: string;
};

// isFree/allowCommercialの組み合わせから、表示用のlicenseTypeを自動的に決める。
// free: 無料かつ商用利用可 / commercial: 有料だが商用利用可(条件付き) /
// editorial: 無料だが商用利用不可(非商用限定) / permission_required: どちらもNG(個別許可制)
function deriveLicenseType(isFree: boolean, allowCommercial: boolean): PhotoSpotLicenseType {
  if (isFree && allowCommercial) return "free";
  if (!isFree && allowCommercial) return "commercial";
  if (isFree && !allowCommercial) return "editorial";
  return "permission_required";
}

async function uploadPhotoSpotPhotos(spotId: string, files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const [i, file] of files.entries()) {
    const compressedResult = await compressImage(file, {
      maxWidth: 1920,
      maxHeight: 1920,
      quality: 0.8,
      format: "webp",
      maxSizeKB: 500,
    });
    const storageRef = ref(
      storage,
      `photo_spots/${spotId}/${Date.now()}-${i}-${compressedResult.file.name}`
    );
    await uploadBytes(storageRef, compressedResult.file);
    urls.push(await getDownloadURL(storageRef));
  }
  return urls;
}

export async function createPhotoSpot(input: NewPhotoSpotInput): Promise<string> {
  const spotRef = doc(collection(db, PHOTO_SPOTS_COLLECTION));
  const photoUrls = await uploadPhotoSpotPhotos(spotRef.id, input.photos);
  const isFree = input.isFree ?? false;
  const allowCommercial = input.allowCommercial ?? false;

  await setDoc(spotRef, {
    name: input.name,
    description: input.description ?? "",
    address: input.address,
    lat: input.lat,
    lng: input.lng,
    photoUrls,
    ...(input.cameraGear ? { cameraGear: input.cameraGear } : {}),
    ...(input.exif ? { exif: input.exif } : {}),
    accessNote: input.accessNote ?? "",
    subjectTags: input.subjectTags ?? [],
    equipmentTags: input.equipmentTags ?? [],
    isFree,
    allowCommercial,
    licenseType: deriveLicenseType(isFree, allowCommercial),
    // ダウンロードURLは別途アップロードするオリジナル画像を持たないため、
    // 現状はギャラリー表示用の画像(1枚目)をそのままダウンロード対象にする。
    // Firestoreはundefinedフィールドを許容しないため、無料でない場合はキー自体を含めない。
    ...(isFree && photoUrls[0] ? { downloadUrl: photoUrls[0] } : {}),
    postedBy: input.postedBy,
    ...(input.postedByName ? { postedByName: input.postedByName } : {}),
    postedAt: serverTimestamp(),
  });

  return spotRef.id;
}

type PhotoSpotDoc = Omit<PhotoSpot, "id" | "postedAt"> & { postedAt: Timestamp | null };

// 一覧取得: 「ここトレ！」はSpotBase本体の組織モデルとは独立した
// パブリックな写真共有サービスのため、組織/分類による絞り込みは行わず
// 全件取得する(firestore.rules側もphoto_spotsは読み取り全公開)。
//
// ローカル開発環境ではFirestoreのセキュリティルール未設定・未デプロイ等により
// "Missing or insufficient permissions" で失敗することがある。photoモードの
// 動作確認自体がブロックされないよう、取得に失敗した場合はエラーを投げず、
// ローカルのダミーデータ(lib/dummyPhotoSpots.ts)にフォールバックする。
export async function getAllPhotoSpots(): Promise<PhotoSpot[]> {
  try {
    const q = query(collection(db, PHOTO_SPOTS_COLLECTION));
    const snap = await getDocs(q);
    const spots = snap.docs.map((d) => {
      const data = d.data() as PhotoSpotDoc;
      return {
        ...data,
        id: d.id,
        postedAt: data.postedAt ? data.postedAt.toDate().toISOString() : null,
      };
    });
    // 投稿がまだ1件もない場合も、空のギャラリーではなくダミーデータで
    // 見た目を確認できるようにフォールバックする。
    return spots.length > 0 ? spots : DUMMY_PHOTO_SPOTS;
  } catch (error) {
    console.warn(
      "ここトレ！: photo_spotsの取得に失敗したため、ローカルのダミーデータで表示します",
      error
    );
    return DUMMY_PHOTO_SPOTS;
  }
}
