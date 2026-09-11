// 日別移動履歴(Firestore `location_histories` コレクション)の取得・加工ユーティリティ。
//
// 書き込み側はlib/userPathHistory.ts(syncDailyLocationHistory)。1ユーザー1日
// につき1ドキュメント(`${uid}_${YYYY-MM-DD}`)に、その日取得した座標をまとめて
// 保存している。本モジュールでは、マップの「経路を見る」機能から指定された
// 日付/uidの履歴を取得する関数と、GPSの電波不良・アプリ休止等で取得が途切れた
// 区間を検出して経路を複数セグメントに分割するユーティリティを提供する。

import { collection, doc, getDoc, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import type { PathPoint } from "./userPathHistory";

export type { PathPoint };

// 隣接する記録点の時刻差がこの値(ミリ秒)以上離れている場合、GPSが一時的に
// 取得できなかった(電波不良・アプリ休止・移動手段の乗換待ち等)区間とみなし、
// その間を直線で結ばず別セグメントとして描画する(ワープしたような不自然な
// 直線を防ぐため)。
export const ROUTE_GAP_THRESHOLD_MS = 10 * 60 * 1000; // 10分

// 時刻(timestamp)に基づき経路を複数セグメントに分割する。
// 各セグメント内は時系列順になるようソートしてから分割する。
export function splitPathIntoSegments(
  path: PathPoint[],
  gapThresholdMs: number = ROUTE_GAP_THRESHOLD_MS
): PathPoint[][] {
  if (path.length === 0) return [];
  const sorted = [...path].sort((a, b) => a.timestamp - b.timestamp);

  const segments: PathPoint[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.timestamp - prev.timestamp > gapThresholdMs) {
      segments.push([cur]);
    } else {
      segments[segments.length - 1].push(cur);
    }
  }
  return segments;
}

// タイムスタンプ(ms)をローカルタイムゾーンの"YYYY-MM-DD"文字列に変換する。
// (lib/userPathHistory.tsのformatDateKeyと同じロジック。日付の跨ぎ方を
// 揃えるため、書き込み側と表示側で必ず同じ実装を使う)
function formatDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function todayDateKey(): string {
  return formatDateKey(new Date());
}

export function yesterdayDateKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDateKey(d);
}

// 指定uidの、指定日(YYYY-MM-DD)1日分の移動履歴を取得する。
// ドキュメントID(`${uid}_${date}`)で直接get()するため、範囲クエリ用の
// 複合インデックスが無くても動作する。データが無い日はから配列を返す。
export async function getDailyLocationHistory(uid: string, date: string): Promise<PathPoint[]> {
  if (!uid || !date) return [];
  try {
    const snap = await getDoc(doc(db, "location_histories", `${uid}_${date}`));
    if (!snap.exists()) return [];
    const data = snap.data() as { path?: PathPoint[] };
    return data.path ?? [];
  } catch (error) {
    console.error(`[移動履歴] location_histories/${uid}_${date} の取得に失敗しました:`, error);
    return [];
  }
}

// 指定uidの、開始日〜終了日(両端含む、YYYY-MM-DD)の範囲の移動履歴をまとめて
// 取得する。1日1ドキュメントを日付の若い順に結合するため、返り値全体も
// 時系列順になる。複数日にまたがる範囲検索のため、Firestore複合インデックス
// (location_histories: uid ASC, date ASC)が必要。
export async function getLocationHistoryRange(
  uid: string,
  startDate: string,
  endDate: string
): Promise<PathPoint[]> {
  if (!uid || !startDate || !endDate) return [];
  try {
    const q = query(
      collection(db, "location_histories"),
      where("uid", "==", uid),
      where("date", ">=", startDate),
      where("date", "<=", endDate),
      orderBy("date", "asc")
    );
    const snap = await getDocs(q);
    const points: PathPoint[] = [];
    for (const d of snap.docs) {
      const data = d.data() as { path?: PathPoint[] };
      if (data.path) points.push(...data.path);
    }
    return points;
  } catch (error) {
    console.error(
      `[移動履歴] location_historiesの範囲取得に失敗しました(uid=${uid}, ${startDate}〜${endDate}):`,
      error
    );
    return [];
  }
}
