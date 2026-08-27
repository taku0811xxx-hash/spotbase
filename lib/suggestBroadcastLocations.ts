// 放送中継の候補地点を自動提案する機能
// 1. 過去の中継実績ポイント(dispatch_records)を検索
// 2. Overpass APIで駐車場・広場・歩道橋などを収集
// 3. 3～4件の候補に絞り込み

import { getDispatchRecordsNear } from "./dispatchRecords";

export type BroadcastLocationCandidate = {
  name: string;
  lat: number;
  lng: number;
  type: "angle" | "parking"; // 象徴的なアングル or 車両待機駐車場
  reason: string; // 簡潔な理由
  distance?: number; // 現場からの距離(メートル)
};

type Scope = { organizationId: string; category: string; isAdmin: boolean };

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a1 = (lat1 * Math.PI) / 180;
  const a2 = (lat2 * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a1) * Math.cos(a2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 過去の中継実績から候補を抽出
async function extractCandidatesFromHistory(
  lat: number,
  lng: number,
  scope: Scope
): Promise<BroadcastLocationCandidate[]> {
  try {
    const nearby = await getDispatchRecordsNear(lat, lng, scope, 500); // 半径500m
    const candidates: BroadcastLocationCandidate[] = [];

    for (const record of nearby.slice(0, 3)) {
      if (!record.lat || !record.lng) continue;

      candidates.push({
        name: record.locationName || record.address,
        lat: record.lat,
        lng: record.lng,
        type: "angle",
        reason: `過去の実績: ${record.incidentType}`,
        distance: distanceMeters(lat, lng, record.lat, record.lng),
      });
    }

    return candidates;
  } catch (err) {
    console.error("過去の実績抽出に失敗:", err);
    return [];
  }
}

// Overpass APIから駐車場を取得
async function fetchParkingLocations(
  lat: number,
  lng: number,
  radiusMeters = 300
): Promise<BroadcastLocationCandidate[]> {
  const query = `
    [out:json][timeout:20];
    (
      way["amenity"="parking"](around:${radiusMeters},${lat},${lng});
      node["amenity"="parking"](around:${radiusMeters},${lat},${lng});
      way["amenity"="parking_entrance"](around:${radiusMeters},${lat},${lng});
    );
    out center;
  `;

  try {
    let res: Response;
    try {
      res = await fetch(OVERPASS_URL, {
        method: "POST",
        body: query,
        headers: { "Content-Type": "text/plain" },
      });
    } catch (fetchError) {
      // Safari の「TypeError: Load failed」などをキャッチ
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error("駐車場検索 - ネットワークエラー（fetch失敗）:", {
        error: errorMessage,
        errorName: fetchError instanceof Error ? fetchError.name : "Unknown",
        url: OVERPASS_URL,
      });
      return [];
    }

    if (!res.ok) {
      console.error("駐車場検索 - HTTPエラー:", {
        status: res.status,
        statusText: res.statusText,
      });
      return [];
    }

    const data = (await res.json()) as {
      elements: Array<{
        lat?: number;
        lon?: number;
        center?: { lat: number; lon: number };
        tags?: Record<string, string>;
      }>;
    };

    const candidates: BroadcastLocationCandidate[] = [];
    for (const el of data.elements) {
      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;
      if (elLat === undefined || elLng === undefined) continue;

      const name = el.tags?.name || `駐車場(${el.tags?.capacity || "容量不明"})`;
      const distance = distanceMeters(lat, lng, elLat, elLng);

      candidates.push({
        name,
        lat: elLat,
        lng: elLng,
        type: "parking",
        reason: `車両待機可能(${Math.round(distance)}m)`,
        distance,
      });
    }

    // 距離でソート、上位3件を返す
    return candidates.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0)).slice(0, 3);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("駐車場検索に失敗:", {
      error: errorMessage,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return [];
  }
}

// Overpass APIから広場・交差点などの象徴的なアングル地点を取得
async function fetchSymbolicLocations(
  lat: number,
  lng: number,
  radiusMeters = 300
): Promise<BroadcastLocationCandidate[]> {
  const query = `
    [out:json][timeout:20];
    (
      way["leisure"="plaza"](around:${radiusMeters},${lat},${lng});
      way["leisure"="park"](around:${radiusMeters},${lat},${lng});
      node["leisure"="plaza"](around:${radiusMeters},${lat},${lng});
      way["highway"="footway"]["name"](around:${radiusMeters},${lat},${lng});
      way["highway"="pedestrian"]["area"="yes"](around:${radiusMeters},${lat},${lng});
      node["man_made"="bridge"](around:${radiusMeters},${lat},${lng});
      way["man_made"="bridge"](around:${radiusMeters},${lat},${lng});
      node["tourism"="viewpoint"](around:${radiusMeters},${lat},${lng});
      node["railway"="station"](around:${radiusMeters},${lat},${lng});
    );
    out center;
  `;

  try {
    let res: Response;
    try {
      res = await fetch(OVERPASS_URL, {
        method: "POST",
        body: query,
        headers: { "Content-Type": "text/plain" },
      });
    } catch (fetchError) {
      // Safari の「TypeError: Load failed」などをキャッチ
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error("象徴的なアングル検索 - ネットワークエラー（fetch失敗）:", {
        error: errorMessage,
        errorName: fetchError instanceof Error ? fetchError.name : "Unknown",
        url: OVERPASS_URL,
      });
      return [];
    }

    if (!res.ok) {
      console.error("象徴的なアングル検索 - HTTPエラー:", {
        status: res.status,
        statusText: res.statusText,
      });
      return [];
    }

    const data = (await res.json()) as {
      elements: Array<{
        lat?: number;
        lon?: number;
        center?: { lat: number; lon: number };
        tags?: Record<string, string>;
      }>;
    };

    const candidates: BroadcastLocationCandidate[] = [];
    for (const el of data.elements) {
      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;
      if (elLat === undefined || elLng === undefined) continue;

      const typeLabel = (() => {
        const t = el.tags ?? {};
        if (t.railway === "station") return "駅";
        if (t.leisure === "plaza") return "広場";
        if (t.leisure === "park") return "公園";
        if (t.man_made === "bridge") return "歩道橋";
        if (t.tourism === "viewpoint") return "展望地点";
        if (t.highway === "pedestrian") return "歩行者エリア";
        return "スポット";
      })();

      const name = el.tags?.name || typeLabel;
      const distance = distanceMeters(lat, lng, elLat, elLng);

      candidates.push({
        name,
        lat: elLat,
        lng: elLng,
        type: "angle",
        reason: `${typeLabel}からの撮影ポイント`,
        distance,
      });
    }

    // 距離でソート、上位4件を返す
    return candidates.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0)).slice(0, 4);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("象徴的なアングル検索に失敗:", {
      error: errorMessage,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return [];
  }
}

// メイン：候補地点を集約して絞り込み
export async function suggestBroadcastLocations(
  lat: number,
  lng: number,
  incidentType: string,
  scope: Scope
): Promise<BroadcastLocationCandidate[]> {
  const [historyCandidates, parkingCandidates, symbolicCandidates] = await Promise.all([
    extractCandidatesFromHistory(lat, lng, scope),
    fetchParkingLocations(lat, lng, 300),
    fetchSymbolicLocations(lat, lng, 300),
  ]);

  // 合わせて最大3～4件に絞る
  // 優先度: 過去の実績 > 象徴的なアングル > 駐車場
  const combined: BroadcastLocationCandidate[] = [
    ...historyCandidates,
    ...symbolicCandidates,
    ...parkingCandidates,
  ];

  // 重複排除（同じ座標は統合）
  const seen = new Set<string>();
  const deduplicated: BroadcastLocationCandidate[] = [];

  for (const candidate of combined) {
    const key = `${Math.round(candidate.lat * 10000)}_${Math.round(candidate.lng * 10000)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduplicated.push(candidate);
  }

  // 距離でソート、最大4件を返す
  return deduplicated
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
    .slice(0, 4);
}
