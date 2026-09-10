// 自分自身(ログインユーザー)の実機GPS移動経路の蓄積・永続化ユーティリティ。
//
// watchPositionで取得した座標をそのまま全部貯めるとGPS誤差によるブレで
// 経路がジグザグになってしまうため、直前に記録した点から一定距離(既定10m)
// 以上移動した場合のみ履歴に追加するフィルタリングを行う。
//
// 永続化は二段構え:
//   1. ブラウザのlocalStorage(`user_path_history`)に常に保存し、リロード後も
//      経路が消えないようにする(DB未接続でも動作するフォールバック)。
//   2. Firestore(`user_locations/{uid}`)にも非同期で同期する。書き込みに
//      失敗してもlocalStorage側の履歴には一切影響させない(ベストエフォート)。

import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export type PathPoint = { lat: number; lng: number; timestamp: number };

const STORAGE_KEY = "user_path_history";

// Firestoreの1ドキュメントサイズ上限(1MB)や無限肥大化を避けるため、
// 保持する座標点数の上限を設け、古い点から間引く。
const MAX_POINTS = 2000;

// この距離(メートル)未満の移動はGPS誤差によるブレとみなし、履歴に追加しない。
export const MIN_DISTANCE_METERS = 10;

// 2点間の距離をHaversine公式で計算する(メートル単位)。
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000; // 地球の半径(m)
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// 新しい点を履歴に追加すべきか判定する(直前の記録点からMIN_DISTANCE_METERS以上
// 移動したかどうか)。履歴がまだ空の場合は初回fixとして無条件で追加する。
export function shouldAppendPoint(path: PathPoint[], next: PathPoint): boolean {
  const last = path[path.length - 1];
  if (!last) return true;
  return distanceMeters(last, next) >= MIN_DISTANCE_METERS;
}

// 点数の上限を超えないよう、古い点から間引きつつ新しい点を末尾に追加する。
export function appendPoint(path: PathPoint[], next: PathPoint): PathPoint[] {
  const updated = [...path, next];
  return updated.length > MAX_POINTS ? updated.slice(updated.length - MAX_POINTS) : updated;
}

export function loadPathFromStorage(): PathPoint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is PathPoint =>
        !!p &&
        typeof p === "object" &&
        typeof (p as PathPoint).lat === "number" &&
        typeof (p as PathPoint).lng === "number" &&
        typeof (p as PathPoint).timestamp === "number"
    );
  } catch (error) {
    console.warn("[GPS履歴] localStorageからの復元に失敗しました:", error);
    return [];
  }
}

export function savePathToStorage(path: PathPoint[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(path.slice(-MAX_POINTS)));
  } catch (error) {
    console.warn("[GPS履歴] localStorageへの保存に失敗しました:", error);
  }
}

// syncPathToFirestoreの追加パラメータ。管理者画面のクルー位置ピン(lib/crewLocations.ts)が
// 表示に使うため、位置(position)に加えてステータス・連絡先も一緒に書き込めるようにしている。
export interface SyncPathExtra {
  // ユーザーステータスパネルで切り替える現在のステータス(待機中/現場対応中 等)
  status?: string;
  phone?: string;
  // 直近の現在地。未指定の場合はpath配列の最終点を使う(pathが空ならposition自体書き込まない)。
  position?: { lat: number; lng: number };
}

// Firestoreへの同期(ベストエフォート)。失敗してもthrowせずログのみに留め、
// 呼び出し側(ローカル保存フロー)に一切影響させない。
export async function syncPathToFirestore(
  uid: string,
  organizationId: string,
  category: string,
  name: string,
  path: PathPoint[],
  extra?: SyncPathExtra
): Promise<void> {
  const last = path[path.length - 1];
  const position = extra?.position ?? (last ? { lat: last.lat, lng: last.lng } : null);

  // uid/organizationIdが空文字・undefinedのまま呼ばれるとuser_locationsが
  // 作成されない(あるいは意図しないドキュメントIDに書き込まれる)原因になるため、
  // 実際にsetDocへ渡る直前の値をここで必ず出力しておく。
  console.log("[GPS履歴][Debug] syncPathToFirestore呼び出し", {
    uid,
    organizationId,
    category,
    name,
    position,
    pathLength: path.length,
    hasStatus: extra?.status !== undefined,
  });

  if (!uid) {
    console.error("[GPS履歴][Debug] uidが空のためuser_locationsへの書き込みをスキップします");
    return;
  }
  if (!organizationId) {
    console.warn(
      "[GPS履歴][Debug] organizationIdが空のまま書き込もうとしています(管理者/他クルー側で表示されない原因になります):",
      { uid }
    );
  }

  try {
    await setDoc(
      doc(db, "user_locations", uid),
      {
        organizationId,
        category,
        name,
        ...(extra?.status !== undefined ? { status: extra.status } : {}),
        ...(extra?.phone !== undefined ? { phone: extra.phone } : {}),
        ...(position ? { position } : {}),
        path: path.slice(-MAX_POINTS),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    console.log("[GPS履歴][Debug] user_locations/" + uid + " への書き込みに成功しました", { position });
  } catch (error) {
    // Firestoreのエラーにはcode(例: "permission-denied", "unavailable")が
    // 含まれるため、原因切り分けのためcode/messageも明示的に出力する。
    const firestoreError = error as { code?: string; message?: string };
    console.error(
      "[GPS履歴] user_locations/" + uid + " へのFirestore同期に失敗しました(localStorageには保存済みのため経路は失われません):",
      {
        code: firestoreError?.code,
        message: firestoreError?.message,
        error,
        uid,
        organizationId,
      }
    );
  }
}
