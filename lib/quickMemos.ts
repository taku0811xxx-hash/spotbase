// 「ここトレ！」専用: ワンタップ「自分メモ」(パーキング保存/カフェ・休憩メモ)と、
// 近隣の撮影スポットへの自動紐付け。
// - photo_quick_memos: 本人だけが読み書きできる私的な備忘録(uid/日時つき)。
// - photo_around_locations: スポットの「周辺の駐車場・カフェ」。個人が特定されないよう
//   uid・日時・メモの元IDは持たず、種別と座標だけを保存する(規則上、作成のみ可・更新/削除不可)。
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, where } from "firebase/firestore";
import { auth, db } from "./firebase";
import { getAllPhotoSpots, filterVisibleSpots } from "./photoSpots";
import { readJson, writeJson } from "./photoStorage";

export type QuickMemoType = "parking" | "cafe";
export const QUICK_MEMO_LABEL: Record<QuickMemoType, string> = { parking: "パーキング", cafe: "カフェ/休憩" };

export type QuickMemo = { id: string; type: QuickMemoType; lat: number; lng: number; createdAt: Date | null; linkedSpotId?: string };
export type AroundLocation = { id: string; spotId: string; type: QuickMemoType; lat: number; lng: number };

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

function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
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
async function linkToNearestSpot(type: QuickMemoType, lat: number, lng: number): Promise<string | null> {
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
    await addDoc(collection(db, AROUND), { spotId: best.id, type, lat, lng, createdAt: serverTimestamp() });
  }
  return best.id;
}

// ワンタップ打刻: 現在地を取得して保存し、共有設定がONなら近隣スポットへ自動紐付けする。
export async function stampQuickMemo(type: QuickMemoType): Promise<{ linkedSpotId: string | null }> {
  const user = auth.currentUser;
  if (!user) throw new Error("ログインが必要です");
  const { lat, lng } = await getCurrentPosition();
  let linkedSpotId: string | null = null;
  if (await getShareAround()) {
    try {
      linkedSpotId = await linkToNearestSpot(type, lat, lng);
    } catch (e) {
      console.error("ここトレ！: 周辺情報の紐付けに失敗しました", e); // 打刻自体は続行する
    }
  }
  await addDoc(collection(db, MEMOS), {
    uid: user.uid,
    type,
    lat,
    lng,
    createdAt: serverTimestamp(),
    ...(linkedSpotId ? { linkedSpotId } : {}),
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
