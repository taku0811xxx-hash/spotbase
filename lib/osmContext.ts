// OpenStreetMapのOverpass APIから、指定地点周辺の建物・出入口・広場などの
// 構造化データを取得する。AIに場所の地理的な文脈を与えるための下ごしらえ。

export type OsmFeature = {
  name: string;
  type: string; // 例: "建物", "駅出入口", "広場" など
  distanceMeters: number;
  bearingLabel: string; // 例: "北", "南東" など、中心地点から見た方角
};

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

function bearingLabel(lat1: number, lng1: number, lat2: number, lng2: number): string {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(dLng);
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const labels = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
  return labels[Math.round(deg / 45) % 8];
}

export async function fetchNearbyOsmFeatures(
  lat: number,
  lng: number,
  radiusMeters = 300
): Promise<OsmFeature[]> {
  const query = `
    [out:json][timeout:20];
    (
      node["railway"="subway_entrance"](around:${radiusMeters},${lat},${lng});
      node["entrance"](around:${radiusMeters},${lat},${lng});
      way["building"]["name"](around:${radiusMeters},${lat},${lng});
      way["leisure"="plaza"](around:${radiusMeters},${lat},${lng});
      way["highway"="pedestrian"]["area"="yes"](around:${radiusMeters},${lat},${lng});
      node["tourism"="viewpoint"](around:${radiusMeters},${lat},${lng});
    );
    out center;
  `;

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    body: query,
    headers: { "Content-Type": "text/plain" },
  });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    elements: Array<{
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }>;
  };

  const typeLabel = (tags: Record<string, string>): string | null => {
    if (tags.railway === "subway_entrance") return "駅出入口";
    if (tags.entrance) return "出入口";
    if (tags.building) return "建物";
    if (tags.leisure === "plaza") return "広場";
    if (tags.highway === "pedestrian") return "歩行者エリア";
    if (tags.tourism === "viewpoint") return "展望スポット";
    return null;
  };

  const features: OsmFeature[] = [];
  for (const el of data.elements) {
    const tags = el.tags ?? {};
    const type = typeLabel(tags);
    if (!type) continue;
    const elLat = el.lat ?? el.center?.lat;
    const elLng = el.lon ?? el.center?.lon;
    if (elLat === undefined || elLng === undefined) continue;

    features.push({
      name: tags.name ?? tags["name:ja"] ?? type,
      type,
      distanceMeters: distanceMeters(lat, lng, elLat, elLng),
      bearingLabel: bearingLabel(lat, lng, elLat, elLng),
    });
  }

  // 近い順に並べて、多すぎる場合は上位だけ返す(AIに渡す情報量を抑えるため)
  features.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return features.slice(0, 15);
}
