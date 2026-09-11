// GPS欠損区間の経路補間ユーティリティ。
//
// 建物内・トンネル・地下・電波不良等で一定時間GPSが取得できなかった区間は、
// 前後の点をそのまま直線で結ぶと「道路を無視してワープしたような」不自然な
// 直線になってしまう。本モジュールでは、区間の長さ(時間・距離)に応じて
// 経路を3種類に分類し、Map.tsx側で見た目を変えて描画できるようにする。
//
//   1. 通常区間(gapなし): そのまま実測点を直線で結ぶ("normal")
//   2. 中程度の欠損(30秒以上300m未満は対象外。30秒〜15分 かつ 200m以上):
//      OSRM(Open Source Routing Machine)の公開デモAPIで道路形状に沿った
//      経路を取得し、それに沿って補間する("interpolated")
//   3. 長時間の欠損(15分以上): 補間しても実際の経路とは限らないため無理に
//      繋がず、データ未取得区間であることが分かるよう破線として描画する
//      ("gap")。OSRM補間に失敗した場合もこちらにフォールバックする。
//
// 注意: ここで使用する https://router.project-osrm.org は無料公開の
// デモサーバーであり、SLA/プライバシーポリシー上、本番の商用サービスとしては
// 座標(=クルーの実際の位置情報)を第三者サーバーに送信することになる。
// 本番運用では自前ホストのOSRMインスタンスや契約ベースの経路探索APIへの
// 差し替えを推奨する。

import { distanceMeters } from "./userPathHistory";
import type { PathPoint } from "./userPathHistory";

// 欠損とみなす最小の時間ギャップ(これ未満は通常区間として直線で繋ぐ)
export const GAP_MIN_MS = 30 * 1000; // 30秒
// 欠損とみなす最小の距離(これ未満は時間が空いていても同じ場所に留まって
// いただけとみなし、通常区間として扱う)
export const GAP_MIN_DISTANCE_M = 200; // 200m
// これ以上の時間ギャップは、道路補間しても実際の経路と一致する保証が
// 低いため、無理に繋がず破線(データ欠損区間)として描画する。
export const GAP_DASHED_MS = 15 * 60 * 1000; // 15分

// OSRM Route APIのタイムアウト(ms)。デモサーバーの応答が遅い/落ちている
// 場合に地図の表示自体をブロックしないよう、短めに設定する。
const OSRM_TIMEOUT_MS = 5000;

export type RoutePieceStyle = "normal" | "interpolated" | "gap";

export type RoutePiece = {
  positions: [number, number][];
  style: RoutePieceStyle;
};

// OSRM(Open Source Routing Machine)の公開デモAPIへ2点間のドライビングルートを
// 問い合わせ、経路形状([lat,lng][])を返す。取得できない場合はnullを返す
// (呼び出し側でフォールバック処理する)。
async function fetchOsrmRoute(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): Promise<[number, number][] | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${a.lng},${a.lat};${b.lng},${b.lat}?geometries=geojson&overview=full`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code?: string;
      routes?: { geometry?: { coordinates?: [number, number][] } }[];
    };
    if (data.code !== "Ok") return null;
    const coords = data.routes?.[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;
    // OSRMは[経度, 緯度]の順で返すため、[緯度, 経度]に変換する
    return coords.map(([lng, lat]) => [lat, lng] as [number, number]);
  } catch (error) {
    console.warn("[経路補間] OSRMルート取得に失敗しました(直線/破線にフォールバックします):", error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// 移動履歴(時刻付き座標の配列)を、記録ギャップの大きさに応じて
// 「通常」「道路補間」「データ欠損(破線)」の3種類のPolyline描画用ピースに
// 分割・変換する。OSRM問い合わせが発生しうるため非同期。
export async function buildRoutePieces(path: PathPoint[]): Promise<RoutePiece[]> {
  const valid = path.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.timestamp)
  );
  if (valid.length < 2) return [];

  const sorted = [...valid].sort((a, b) => a.timestamp - b.timestamp);

  const pieces: RoutePiece[] = [];
  let currentNormal: [number, number][] = [[sorted[0].lat, sorted[0].lng]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const dtMs = cur.timestamp - prev.timestamp;
    const distM = distanceMeters(prev, cur);

    const isGap = dtMs >= GAP_MIN_MS && distM >= GAP_MIN_DISTANCE_M;
    if (!isGap) {
      // 通常区間: そのまま実測点を繋げる
      currentNormal.push([cur.lat, cur.lng]);
      continue;
    }

    // ここでギャップが発生したので、それまでの通常セグメントを確定させる
    if (currentNormal.length > 1) {
      pieces.push({ positions: currentNormal, style: "normal" });
    }

    if (dtMs >= GAP_DASHED_MS) {
      // 長時間の欠損: 無理に繋げず、データ未取得区間として破線で描画する
      pieces.push({
        positions: [
          [prev.lat, prev.lng],
          [cur.lat, cur.lng],
        ],
        style: "gap",
      });
    } else {
      // 中程度の欠損: OSRMで道路形状に沿った経路を取得して補間する
      const routed = await fetchOsrmRoute(prev, cur);
      if (routed) {
        pieces.push({ positions: routed, style: "interpolated" });
      } else {
        // 補間に失敗した場合は「データが不確実な区間」として破線にフォールバックする
        pieces.push({
          positions: [
            [prev.lat, prev.lng],
            [cur.lat, cur.lng],
          ],
          style: "gap",
        });
      }
    }

    // 次の通常セグメントはcurから再開する
    currentNormal = [[cur.lat, cur.lng]];
  }

  if (currentNormal.length > 1) {
    pieces.push({ positions: currentNormal, style: "normal" });
  }

  return pieces;
}
