// 「ここトレ！」専用: ワンタップ「自分メモ」(パーキング保存/カフェ・休憩メモ)と、
// 近隣の撮影スポットへの自動紐付け。
// - photo_quick_memos: 本人だけが読み書きできる私的な備忘録(uid/日時つき)。
// - photo_around_locations: スポットの「周辺の駐車場・カフェ」。個人が特定されないよう
//   uid・日時・メモの元IDは持たず、種別と座標だけを保存する(規則上、作成のみ可・更新/削除不可)。
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { compressImage } from "./imageCompression";
import { auth, db, storage } from "./firebase";
import { getAllPhotoSpots, filterVisibleSpots } from "./photoSpots";
import { readJson, writeJson } from "./photoStorage";

export type QuickMemoType = "parking" | "cafe";
export const QUICK_MEMO_LABEL: Record<QuickMemoType, string> = { parking: "パーキング", cafe: "カフェ/休憩" };

export type QuickMemo = { id: string; type: QuickMemoType; lat: number; lng: number; createdAt: Date | null; linkedSpotId?: string; photoUrl?: string };
export type AroundLocation = { id: string; spotId: string; type: QuickMemoType; lat: number; lng: number; photoUrl?: string };

const MEMOS = "photo_quick_memos";
const AROUND = "photo_around_locations";
const LINK_RADIUS_M = 1000; // この距離内の最寄りスポットに紐付ける
const DEDUPE_M = 30; // 同じスポット・同種別でこの距離内なら重複登録しない
const SHARE_KEY = "kokotore_share_around";

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 周辺情報として匿名で共有するか(既定: 共有する)。端末内設定。
export async function getShareAround(): Promise<boolean> {
  return readJson<boolean>(SHARE_KEY, true);
}
export async function setShareAround(v: boolean): Promise<void> {
  await writeJson(SHARE_KEY, v);
}

export function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("この端末では位置情報を取得できません"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error("現在地を取得できませんでした。位置情報の許可をご確認ください")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
  });
}

// 最寄りの公開スポットに周辺情報として紐付ける。紐付けたスポットIDを返す(なければnull)。
async function linkToNearestSpot(type: QuickMemoType, lat: number, lng: number, photoUrl?: string): Promise<string | null> {
  const spots = filterVisibleSpots(await getAllPhotoSpots(), null);
  let best: { id: string; d: number } | null = null;
  for (const s of spots) {
    const d = distanceMeters(lat, lng, s.lat, s.lng);
    if (d <= LINK_RADIUS_M && (!best || d < best.d)) best = { id: s.id, d };
  }
  if (!best) return null;
  const existing = await getAroundLocations(best.id);
  const dup = existing.some((a) => a.type === type && distanceMeters(lat, lng, a.lat, a.lng) <= DEDUPE_M);
  if (!dup) {
    await addDoc(collection(db, AROUND), {
      spotId: best.id,
      type,
      lat,
      lng,
      createdAt: serverTimestamp(),
      ...(photoUrl ? { photoUrl } : {}),
    });
  }
  return best.id;
}

async function uploadMemoPhoto(uid: string, file: File, shared: boolean): Promise<string> {
  const c = await compressImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.8, format: "webp", maxSizeKB: 500 });
  if (c.file.size === 0) throw new Error("圧縮後の画像データが空です");
  // 共有ONなら匿名の公開パス(uidを含めない)、OFFなら本人専用パスに置く。
  const path = shared
    ? `photo_around/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`
    : `photo_quick_memos/${uid}/${Date.now()}.webp`;
  const r = ref(storage, path);
  await uploadBytes(r, c.file, { cacheControl: "public, max-age=31536000", contentType: c.file.type });
  return getDownloadURL(r);
}

// 確認モーダルで「登録する」を押した後の保存処理。写真(任意)をアップロードして自分メモに保存し、
// 共有設定がONなら近隣スポットへ写真つきで自動紐付けする。
export async function saveQuickMemo(
  type: QuickMemoType,
  pos: { lat: number; lng: number },
  photo?: File | null
): Promise<{ linkedSpotId: string | null }> {
  const user = auth.currentUser;
  if (!user) throw new Error("ログインが必要です");
  const { lat, lng } = pos;
  const shared = await getShareAround();
  let photoUrl: string | undefined;
  if (photo) {
    try {
      photoUrl = await uploadMemoPhoto(user.uid, photo, shared);
    } catch (e) {
      console.error("ここトレ！: 自分メモの写真アップロードに失敗しました", e); // 写真なしで続行
    }
  }
  let linkedSpotId: string | null = null;
  if (shared) {
    try {
      linkedSpotId = await linkToNearestSpot(type, lat, lng, photoUrl);
    } catch (e) {
      console.error("ここトレ！: 周辺情報の紐付けに失敗しました", e); // 保存自体は続行する
    }
  }
  await addDoc(collection(db, MEMOS), {
    uid: user.uid,
    type,
    lat,
    lng,
    createdAt: serverTimestamp(),
    ...(linkedSpotId ? { linkedSpotId } : {}),
    ...(photoUrl ? { photoUrl } : {}),
  });
  return { linkedSpotId };
}

export async function getMyQuickMemos(): Promise<QuickMemo[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const snap = await getDocs(query(collection(db, MEMOS), where("uid", "==", user.uid), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      type: x.type,
      lat: x.lat,
      lng: x.lng,
      createdAt: x.createdAt?.toDate?.() ?? null,
      linkedSpotId: x.linkedSpotId,
      photoUrl: x.photoUrl,
    };
  });
}

export async function deleteQuickMemo(id: string): Promise<void> {
  await deleteDoc(doc(db, MEMOS, id));
}

export async function getAroundLocations(spotId: string): Promise<AroundLocation[]> {
  const snap = await getDocs(query(collection(db, AROUND), where("spotId", "==", spotId)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AroundLocation, "id">) }));
}
