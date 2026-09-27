// 「ここトレ！」(APP_MODE === 'photo')専用のデータアクセス層。
// SpotBase本体のlib/pins.ts("pins"コレクション)とは別の"photo_spots"コレクションを
// 参照する。photoモードのコードはこのファイルのみを通じてデータを読み書きし、
// pro向けのlib/pins.tsには一切依存しない(データソースレベルでの分離)。
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "./firebase";
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
    try {
      // アプリ起動・ギャラリー表示の高速化とストレージ節約のため、投稿時点で
      // 最大1200px・画質0.8程度まで縮小してからアップロードする(元の高解像度
      // 画像はそのまま送信しない)。
      const compressedResult = await compressImage(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.8,
        format: "webp",
        maxSizeKB: 500,
      });
      if (compressedResult.file.size === 0) {
        throw new Error(`圧縮後の画像データが空です(${file.name})`);
      }
      const storageRef = ref(
        storage,
        `photo_spots/${spotId}/${Date.now()}-${i}-${compressedResult.file.name}`
      );
      // 投稿写真は編集不可(差し替えは新規アップロード)の公開画像のため、CDN/端末側で
      // 長期キャッシュしてよい。Cache-Controlを設定し、再読み込み時の帯域課金を防ぐ。
      await uploadBytes(storageRef, compressedResult.file, {
        cacheControl: "public, max-age=31536000",
        contentType: compressedResult.file.type,
      });
      urls.push(await getDownloadURL(storageRef));
    } catch (error) {
      // storage/unauthorized・permission-denied等、Firebaseのエラーコードが
      // わかるようにファイル単位でログを残す(コンソールで原因を特定しやすくするため)。
      console.error("Upload Error:", {
        fileIndex: i,
        fileName: file.name,
        code: (error as { code?: string })?.code,
        error,
      });
      throw error;
    }
  }
  return urls;
}

export async function createPhotoSpot(input: NewPhotoSpotInput): Promise<string> {
  // firestore.rules/storage.rulesは"ログイン中のユーザー本人(auth.uid)"であることを
  // 前提にしている。呼び出し元(PhotoUploadModal)が渡すinput.postedByは
  // AuthProviderのphotoProfile.uidから来ているが、認証状態の更新タイミングの
  // ズレ等でauth.currentUser.uidとずれていると、setDoc/uploadBytesが
  // permission-denied / storage/unauthorizedで失敗する。ここで早期に検知し、
  // 分かりにくい権限エラーではなく明確な原因をログに残す。
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) {
    const error = new Error("ログイン状態が確認できません。再度ログインしてください。");
    console.error("Upload Error:", { reason: "auth.currentUser is null", error });
    throw error;
  }
  if (currentUid !== input.postedBy) {
    const error = new Error("ログイン中のユーザー情報が一致しません。再度ログインしてください。");
    console.error("Upload Error:", {
      reason: "postedBy mismatch",
      currentUid,
      postedBy: input.postedBy,
      error,
    });
    throw error;
  }

  const spotRef = doc(collection(db, PHOTO_SPOTS_COLLECTION));
  const photoUrls = await uploadPhotoSpotPhotos(spotRef.id, input.photos);
  const isFree = input.isFree ?? false;
  const allowCommercial = input.allowCommercial ?? false;

  try {
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
  } catch (error) {
    console.error("Upload Error:", {
      reason: "setDoc failed",
      code: (error as { code?: string })?.code,
      spotId: spotRef.id,
      error,
    });
    throw error;
  }

  return spotRef.id;
}

export type PhotoSpotUpdateInput = {
  name?: string;
  description?: string;
  accessNote?: string;
  subjectTags?: PhotoSpotSubjectTag[];
  equipmentTags?: PhotoSpotEquipmentTag[];
  isFree?: boolean;
  allowCommercial?: boolean;
};

// マイページの投稿詳細から、キャプション・タグ等の補足情報のみを更新する
// (写真・撮影場所・EXIFは投稿後の編集対象外。差し替えたい場合は新規投稿する運用)。
// firestore.rulesでは投稿者本人(postedBy)のみupdateを許可している。
export async function updatePhotoSpot(spotId: string, input: PhotoSpotUpdateInput): Promise<void> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) {
    throw new Error("ログイン状態が確認できません。再度ログインしてください。");
  }

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.accessNote !== undefined) updates.accessNote = input.accessNote;
  if (input.subjectTags !== undefined) updates.subjectTags = input.subjectTags;
  if (input.equipmentTags !== undefined) updates.equipmentTags = input.equipmentTags;
  if (input.isFree !== undefined) updates.isFree = input.isFree;
  if (input.allowCommercial !== undefined) updates.allowCommercial = input.allowCommercial;
  if (input.isFree !== undefined || input.allowCommercial !== undefined) {
    // licenseTypeはisFree/allowCommercialから導出される表示用バッジのため、
    // どちらかを変更した場合は既存値との組み合わせがずれないようここでも再計算する。
    // (呼び出し元は変更後の最終値を両方渡すこと)
    if (input.isFree !== undefined && input.allowCommercial !== undefined) {
      updates.licenseType = deriveLicenseType(input.isFree, input.allowCommercial);
    }
  }

  await updateDoc(doc(db, PHOTO_SPOTS_COLLECTION, spotId), updates);
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

const DEFAULT_PAGE_SIZE = 20;

export type PhotoSpotsPage = {
  spots: PhotoSpot[];
  // 次ページ取得時にstartAfterへ渡すカーソル。これ以上ページが無い場合はnull。
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
};

// トップ画面(ギャラリー)向けのページング取得。全件取得(getAllPhotoSpots)は
// 投稿数が増えるほどFirestoreの読み取り件数課金が膨らむため、初回表示は
// 新着順に20件のみ取得し、スクロール末尾に到達したタイミングで追加取得する
// (無限スクロール。呼び出し側はPhotoGalleryViewのonLoadMore経由)。
export async function getPhotoSpotsPage(
  pageSize: number = DEFAULT_PAGE_SIZE,
  cursor: QueryDocumentSnapshot<DocumentData> | null = null
): Promise<PhotoSpotsPage> {
  try {
    const constraints = cursor
      ? [orderBy("postedAt", "desc"), startAfter(cursor), limit(pageSize)]
      : [orderBy("postedAt", "desc"), limit(pageSize)];
    const q = query(collection(db, PHOTO_SPOTS_COLLECTION), ...constraints);
    const snap = await getDocs(q);
    const spots = snap.docs.map((d) => {
      const data = d.data() as PhotoSpotDoc;
      return {
        ...data,
        id: d.id,
        postedAt: data.postedAt ? data.postedAt.toDate().toISOString() : null,
      };
    });

    // 初回ページで1件も無い場合のみ、開発確認用にダミーデータへフォールバックする
    // (2ページ目以降が空なのは単に「もう投稿が無い」ことを意味するため対象外)。
    if (!cursor && spots.length === 0) {
      return { spots: DUMMY_PHOTO_SPOTS, cursor: null, hasMore: false };
    }

    const lastDoc = snap.docs[snap.docs.length - 1] ?? null;
    return { spots, cursor: lastDoc, hasMore: snap.docs.length === pageSize };
  } catch (error) {
    console.warn(
      "ここトレ！: photo_spotsのページ取得に失敗しました",
      error
    );
    if (!cursor) {
      return { spots: DUMMY_PHOTO_SPOTS, cursor: null, hasMore: false };
    }
    return { spots: [], cursor: null, hasMore: false };
  }
}
