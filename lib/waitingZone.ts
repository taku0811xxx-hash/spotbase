import * as turf from '@turf/turf';
import nearestPointOnLine from '@turf/nearest-point-on-line';

/**
 * 待機・車寄せエリアの型定義
 */
export interface DropoffSpot {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  properties: {
    name: string;
    distance: number; // 現場からの距離（m）
  };
}

export interface WaitingLine {
  type: 'Feature';
  geometry: {
    type: 'LineString';
    coordinates: [number, number][]; // [[lng, lat], ...]
  };
  properties: {
    distance: number; // 現場からの距離（m）
    roadType: string;
    tags?: Record<string, string>;
  };
}

export interface WaitingZoneData {
  dropoffSpots: DropoffSpot[];
  waitingLines: WaitingLine[];
  loadedAt: string;
}

/**
 * キャッシュ（簡易実装）
 */
const waitingZoneCache = new Map<string, WaitingZoneData>();

/**
 * 座標のキー化
 */
function getCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/**
 * Overpass API で道路データを取得
 */
async function fetchRoadDataFromOverpass(lat: number, lng: number, radius: number = 500): Promise<GeoJSON.FeatureCollection> {
  const bbox = `${lat - radius / 111000},${lng - radius / 111000},${lat + radius / 111000},${lng + radius / 111000}`;
  const query = `
    [out:json];
    (
      way["highway"~".*"](${bbox});
    );
    out geom;
  `;

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    });

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.statusText}`);
    }

    const data = await response.json() as any;

    // OSM データを GeoJSON に変換
    const features: GeoJSON.Feature[] = [];

    if (data.elements) {
      for (const element of data.elements) {
        if (element.type === 'way' && element.geometry && element.geometry.length > 1) {
          const coordinates = element.geometry.map((node: any) => [node.lon, node.lat]);

          features.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates,
            },
            properties: {
              ...element.tags,
              id: element.id,
            },
          });
        }
      }
    }

    return {
      type: 'FeatureCollection',
      features,
    };
  } catch (error) {
    console.error('Failed to fetch road data from Overpass API:', error);
    return { type: 'FeatureCollection', features: [] };
  }
}

/**
 * 交差点を検出
 */
function findIntersections(features: GeoJSON.Feature[]): any[] {
  const intersections: any[] = [];

  // 簡易的な交差点検出：複数の道路が同じ点で交わる場合
  const pointCounts = new Map<string, number>();

  for (const feature of features) {
    if (feature.geometry.type === 'LineString') {
      const coords = feature.geometry.coordinates as [number, number][];
      for (const coord of coords) {
        const key = `${coord[1].toFixed(6)},${coord[0].toFixed(6)}`;
        pointCounts.set(key, (pointCounts.get(key) || 0) + 1);
      }
    }
  }

  // 交差点（3つ以上の道路が交わる点）を抽出
  for (const [key, count] of pointCounts) {
    if (count >= 3) {
      const [lat, lng] = key.split(',').map(Number);
      intersections.push(turf.point([lng, lat]));
    }
  }

  return intersections;
}

/**
 * 降機材（車寄せ）スポットを抽出
 */
function extractDropoffSpots(
  features: GeoJSON.Feature[],
  siteLocation: any,
  intersections: any[],
  maxDistance: number = 30
): DropoffSpot[] {
  const dropoffSpots: DropoffSpot[] = [];

  for (const feature of features) {
    if (feature.geometry.type === 'LineString') {
      const line = turf.lineString(feature.geometry.coordinates as [number, number][]);
      const nearestPoint = nearestPointOnLine(line, siteLocation);

      const distance = turf.distance(siteLocation, nearestPoint, { units: 'meters' });

      if (distance > 0 && distance <= maxDistance) {
        // 交差点から 5m 以上離れているか確認
        let isValidPosition = true;
        for (const intersection of intersections) {
          const distToIntersection = turf.distance(nearestPoint, intersection, { units: 'meters' });
          if (distToIntersection < 5) {
            isValidPosition = false;
            break;
          }
        }

        if (isValidPosition) {
          dropoffSpots.push({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: nearestPoint.geometry.coordinates as [number, number],
            },
            properties: {
              name: '降機材位置',
              distance,
            },
          });
        }
      }
    }
  }

  return dropoffSpots;
}

/**
 * 乗車待機推奨ラインを抽出
 */
function extractWaitingLines(
  features: GeoJSON.Feature[],
  siteLocation: any,
  minDistance: number = 100,
  maxDistance: number = 500
): WaitingLine[] {
  const waitingLines: WaitingLine[] = [];

  for (const feature of features) {
    if (feature.geometry.type === 'LineString') {
      const props = feature.properties || {};
      const highway = props.highway || '';

      // 条件 1: 広い道路（primary, secondary, tertiary, または lanes >= 2, width >= 8）
      const isWideRoad =
        ['primary', 'secondary', 'tertiary'].includes(highway) ||
        (parseInt(props.lanes) >= 2) ||
        (parseInt(props.width) >= 8);

      // 条件 2: 狭小路を除外
      const isNarrowRoad =
        ['service', 'living_street', 'residential'].includes(highway) ||
        (props.oneway === 'yes' && highway !== 'primary' && highway !== 'secondary');

      if (!isWideRoad || isNarrowRoad) {
        continue;
      }

      // 最も近い点の距離を計算
      const line = turf.lineString(feature.geometry.coordinates as [number, number][]);
      const nearestPoint = nearestPointOnLine(line, siteLocation);
      const distance = turf.distance(siteLocation, nearestPoint, { units: 'meters' });

      if (distance >= minDistance && distance <= maxDistance) {
        waitingLines.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: feature.geometry.coordinates as [number, number][],
          },
          properties: {
            distance,
            roadType: highway,
            tags: props,
          },
        });
      }
    }
  }

  return waitingLines;
}

/**
 * メイン関数：待機・車寄せエリアを自動抽出
 */
export async function extractWaitingZones(lat: number, lng: number): Promise<WaitingZoneData> {
  const cacheKey = getCacheKey(lat, lng);

  // キャッシュから取得
  if (waitingZoneCache.has(cacheKey)) {
    const cached = waitingZoneCache.get(cacheKey);
    if (cached && new Date(cached.loadedAt).getTime() > Date.now() - 3600000) {
      // 1時間以内のキャッシュは有効
      return cached;
    }
  }

  try {
    const siteLocation = turf.point([lng, lat]);

    // 道路データを取得
    const roadData = await fetchRoadDataFromOverpass(lat, lng, 500);

    if (roadData.features.length === 0) {
      return {
        dropoffSpots: [],
        waitingLines: [],
        loadedAt: new Date().toISOString(),
      };
    }

    // 交差点を検出
    const intersections = findIntersections(roadData.features);

    // 降機材スポットを抽出
    const dropoffSpots = extractDropoffSpots(roadData.features, siteLocation, intersections);

    // 待機ラインを抽出
    const waitingLines = extractWaitingLines(roadData.features, siteLocation);

    const result: WaitingZoneData = {
      dropoffSpots,
      waitingLines,
      loadedAt: new Date().toISOString(),
    };

    // キャッシュに保存
    waitingZoneCache.set(cacheKey, result);

    return result;
  } catch (error) {
    console.error('Error extracting waiting zones:', error);
    return {
      dropoffSpots: [],
      waitingLines: [],
      loadedAt: new Date().toISOString(),
    };
  }
}
