// OpenStreetMapのOverpass API(無料)を使って、指定した地点の周辺にある
// 車線数の多い道路(=駐車・停車しやすい可能性がある道路)を検索する。
//
// 注意: 日本の道路データは「車線数(lanes)」タグが入力されていない場所が多く、
// 都心の主要道路以外ではヒットしないことが多い。あくまで補助的な参考情報として扱うこと。

export type RoadSuggestion = {
  id: number;
  name: string;
  lanes: number;
  coordinates: [number, number][]; // [lat, lng]の配列
  distanceMeters: number; // 検索した地点からの最短距離
};

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function distanceMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 座標列の中から、対象地点に最も近い距離を返す
function nearestDistance(
  coordinates: [number, number][],
  lat: number,
  lng: number
): number {
  let best = Infinity;
  for (const point of coordinates) {
    const d = distanceMeters(point, [lat, lng]);
    if (d < best) best = d;
  }
  return best;
}

// 「片側2車線以上」の目安として、合計車線数4以上(往復想定)、
// または一方通行(oneway)で車線数2以上の道路を候補とする。
// 車線数が多い順→近い順に並べ替え、上位のみ返すことで候補を絞り込む。
export async function findWideRoadsNear(
  lat: number,
  lng: number,
  radiusMeters = 600,
  maxResults = 5
): Promise<RoadSuggestion[]> {
  const query = `
    [out:json][timeout:20];
    (
      way["highway"]["lanes"~"^[4-9]$"](around:${radiusMeters},${lat},${lng});
      way["highway"]["oneway"="yes"]["lanes"~"^[2-9]$"](around:${radiusMeters},${lat},${lng});
    );
    out geom;
  `;

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    body: query,
    headers: { "Content-Type": "text/plain" },
  });

  if (!res.ok) return [];

  const data = (await res.json()) as {
    elements: Array<{
      id: number;
      tags?: Record<string, string>;
      geometry?: Array<{ lat: number; lon: number }>;
    }>;
  };

  const roads = data.elements
    .filter((el) => el.geometry && el.geometry.length > 1)
    .map((el) => {
      const coordinates = el.geometry!.map((g) => [g.lat, g.lon] as [number, number]);
      return {
        id: el.id,
        name: el.tags?.name ?? el.tags?.["name:ja"] ?? "名称不明の道路",
        lanes: Number(el.tags?.lanes ?? 0),
        coordinates,
        distanceMeters: nearestDistance(coordinates, lat, lng),
      };
    });

  // 車線数が多い順、同じ車線数なら現場に近い順に並べて上位だけ残す
  roads.sort((a, b) => b.lanes - a.lanes || a.distanceMeters - b.distanceMeters);

  return roads.slice(0, maxResults);
}

// 「駐停車」向け: 長時間の駐車と違い、短時間止められればいいので
// 車線数の条件は設けず、現場のすぐ近くにある一般道路を候補として探す。
// 車線数タグの有無に依存しないため、駐車候補より見つかりやすい。
export async function findStoppableRoadsNear(
  lat: number,
  lng: number,
  radiusMeters = 150,
  maxResults = 5
): Promise<RoadSuggestion[]> {
  const query = `
    [out:json][timeout:20];
    (
      way["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street)$"](around:${radiusMeters},${lat},${lng});
    );
    out geom;
  `;

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    body: query,
    headers: { "Content-Type": "text/plain" },
  });

  if (!res.ok) return [];

  const data = (await res.json()) as {
    elements: Array<{
      id: number;
      tags?: Record<string, string>;
      geometry?: Array<{ lat: number; lon: number }>;
    }>;
  };

  const roads = data.elements
    .filter((el) => el.geometry && el.geometry.length > 1)
    .map((el) => {
      const coordinates = el.geometry!.map((g) => [g.lat, g.lon] as [number, number]);
      return {
        id: el.id,
        name: el.tags?.name ?? el.tags?.["name:ja"] ?? "名称不明の道路",
        lanes: Number(el.tags?.lanes ?? 0),
        coordinates,
        distanceMeters: nearestDistance(coordinates, lat, lng),
      };
    });

  // 駐停車は車線数を問わず、とにかく近い順に並べる
  roads.sort((a, b) => a.distanceMeters - b.distanceMeters);

  return roads.slice(0, maxResults);
}

// 道路の座標列の中から、対象地点(lat, lng)に最も近い点を返す
export function nearestPointOnRoad(
  road: RoadSuggestion,
  lat: number,
  lng: number
): { point: [number, number]; distanceMeters: number } {
  let best = road.coordinates[0];
  let bestDist = distanceMeters(best, [lat, lng]);
  for (const point of road.coordinates) {
    const d = distanceMeters(point, [lat, lng]);
    if (d < bestDist) {
      best = point;
      bestDist = d;
    }
  }
  return { point: best, distanceMeters: bestDist };
}
