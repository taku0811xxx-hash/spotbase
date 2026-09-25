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
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { compressImage } from "./imageCompression";

// 現場クルーが地図上に投稿する一次情報(ロケ地・搬入ロジ・許諾知見・注意情報等)。
// pinsのような詳細な現場情報とは別に、「今この瞬間」の速報的なメモを
// 軽量に共有するための機能。復旧(resolved)になったものは地図上から消える。
export type FieldNoteCategory = "location" | "logistics" | "permission" | "hazard";
export type FieldNoteStatus = "active" | "resolved";

// カテゴリごとの表示情報(日本語ラベル・アイコン色)を一箇所に集約し、
// フォーム/マップアイコン/一覧パネルの間で表示がズレないようにする。
// emojiはマップ上のピンアイコン(グラフィック)にのみ使用し、パネル・フォーム等の
// テキストUIでは表示しない(アイコン全廃・テキストベースのミニマルデザイン方針)。
export const FIELD_NOTE_CATEGORY_META: Record<
  FieldNoteCategory,
  { label: string; emoji: string; color: string }
> = {
  location: { label: "ロケ地・画角", emoji: "🎬", color: "#0ea5e9" },
  logistics: { label: "搬入・駐車場", emoji: "🚚", color: "#7c3aed" },
  permission: { label: "撮影許可", emoji: "📝", color: "#059669" },
  hazard: { label: "注意・安全", emoji: "⚠️", color: "#dc2626" },
};

export const FIELD_NOTE_CATEGORIES: FieldNoteCategory[] = [
  "location",
  "logistics",
  "permission",
  "hazard",
];

// 投稿フォームでチップ選択できるタグの候補。自由記述ではなく選択式にすることで
// 表記ゆれを防ぎ、将来のフィルタ/検索でも扱いやすくする。
export const FIELD_NOTE_TAG_OPTIONS: string[] = [
  "電源あり",
  "回線良好",
  "トイレ近",
  "ロケバス可",
  "屋根あり",
  "許可必要",
  "駐車場あり",
  "控室あり",
  "夜間不可",
  "騒音注意",
];

// ユーザーが自由に追加できるカスタム項目(キー・値のセット)。
// 「電波情報」「駐車場情報」等のプリセットも、結局はこの形で保存される。
export type FieldNoteCustomField = {
  key: string;
  value: string;
};

// 図面(配置図・見取り図等)ファイル1件分。投稿のたびに配列へ追加され、
// 過去の図面も履歴として残り続ける。
export type FieldNoteDrawing = {
  id: string;
  url: string;
  fileName: string;
  uploadedAt: Timestamp;
  uploadedBy: string;
  isLatest: boolean; // drawings配列中でuploadedAtが最も新しい1件のみtrue
};

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
  tags?: string[]; // 例: ['電源あり', 'ロケバス可', '屋根あり', '許可必要']
  contactInfo?: string; // 許諾先・担当者メモ(公開)
  images?: string[]; // ロケハン写真URL配列
  drawings?: FieldNoteDrawing[]; // 図面(配置図等、PDF/画像)のアップロード履歴
  name?: string; // 現場名・ロケ地名
  referenceId?: string; // 管理ID・参照番号(現場記録フォーム独自の任意識別子)
  address?: string; // 住所(ジオコーディング結果、または手入力)
  addressNote?: string; // 補足住所・アクセス方法
  privateNote?: string; // 非公開メモ(社内共有のみ想定。将来的なアクセス制御は別途検討)
  customFields?: FieldNoteCustomField[]; // ユーザーが自由に追加した項目(電波情報・駐車場情報等)
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
  tags?: string[];
  contactInfo?: string;
  images?: string[];
  drawings?: FieldNoteDrawing[];
  name?: string;
  referenceId?: string;
  address?: string;
  addressNote?: string;
  privateNote?: string;
  customFields?: FieldNoteCustomField[];
};

// カスタム項目のプリセット(制作現場で頻出する項目名)。入力フォーム左側の
// ナビゲーションで「搬入・駐車場・アクセス」「通信・周辺環境」の2タブに
// 分けて表示するため、タブごとにグループ分けしてある。
export const FIELD_NOTE_LOGISTICS_PRESETS: string[] = ["駐車場情報"];
// 「通信」タブ: 電波状況(キャリア別5G/4G)、Wi-Fiの有無など
export const FIELD_NOTE_COMM_PRESETS: string[] = ["電波情報", "Wi-Fi"];
// 「周辺環境」タブ: 宿泊施設・コンビニ・コインランドリー・ドラッグストア等
export const FIELD_NOTE_ENVIRONMENT_PRESETS: string[] = [
  "周辺の宿泊施設",
  "電源・容量",
  "周辺施設",
];

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
    ...(input.tags && input.tags.length > 0 ? { tags: input.tags } : {}),
    ...(input.contactInfo ? { contactInfo: input.contactInfo } : {}),
    ...(input.images && input.images.length > 0 ? { images: input.images } : {}),
    ...(input.drawings && input.drawings.length > 0
      ? { drawings: input.drawings }
      : {}),
    ...(input.name ? { name: input.name } : {}),
    ...(input.referenceId ? { referenceId: input.referenceId } : {}),
    ...(input.address ? { address: input.address } : {}),
    ...(input.addressNote ? { addressNote: input.addressNote } : {}),
    ...(input.privateNote ? { privateNote: input.privateNote } : {}),
    ...(input.customFields && input.customFields.length > 0
      ? { customFields: input.customFields }
      : {}),
  });
  return docRef.id;
}

/**
 * 現場記録フォームの写真を圧縮してFirebase Storageにアップロードし、
 * ダウンロードURLの配列を返す。
 * Storageルールの都合上、既存のpins/配下のパス(読み書き許可済み)を間借りする形で
 * `pins/site_records/{tempId}/...` に保存する(field_notesドキュメントのIDは
 * addDoc完了後にしか分からないため、アップロード時点ではtempIdを別途採番する)。
 */
export async function uploadFieldNoteImages(
  tempId: string,
  files: File[]
): Promise<string[]> {
  const urls: string[] = [];
  for (const [i, file] of files.entries()) {
    const compressed = await compressImage(file, {
      maxWidth: 1920,
      maxHeight: 1920,
      quality: 0.8,
      format: "webp",
      maxSizeKB: 500,
    });
    const storageRef = ref(
      storage,
      `pins/site_records/${tempId}/${Date.now()}-${i}-${compressed.file.name}`
    );
    await uploadBytes(storageRef, compressed.file);
    urls.push(await getDownloadURL(storageRef));
  }
  return urls;
}

/**
 * 現場記録フォームの図面(PDF/画像)をFirebase Storageにアップロードし、
 * 図面履歴(アップロード日時・アップロード者付き)の配列を返す。
 * PDFは画像圧縮の対象外(compressImageは画像専用)なので、拡張子で分岐してそのまま
 * アップロードする。新規作成時点では他に図面がないため、最後の1件が常にisLatest: trueになる。
 */
export async function uploadFieldNoteDrawings(
  tempId: string,
  files: File[],
  uploadedBy: string
): Promise<FieldNoteDrawing[]> {
  const drawings: FieldNoteDrawing[] = [];
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
      `pins/site_records/${tempId}/drawings/${Date.now()}-${i}-${uploadFile.name}`
    );
    await uploadBytes(storageRef, uploadFile);
    const url = await getDownloadURL(storageRef);
    drawings.push({
      id: storageRef.name,
      url,
      fileName: file.name,
      uploadedAt: Timestamp.now(),
      uploadedBy,
      isLatest: false,
    });
  }
  if (drawings.length > 0) {
    drawings[drawings.length - 1].isLatest = true;
  }
  return drawings;
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
