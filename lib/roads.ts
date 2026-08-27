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

// Overpass API のミラーサーバー一覧(優先順位順)。
// 本家サーバーが混雑・タイムアウトしている場合に備えて、複数のミラーへ
// 順番にフォールバックする。
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

// 1サーバーあたりのタイムアウト(ミリ秒)。
// Overpass APIはクエリが混雑していると応答に時間がかかることがあるため、
// 短時間で通信を切断せず、Overpassの標準的なクエリタイムアウト(20〜25秒)に
// 余裕を持たせた60秒を上限とし、結果が返るまでしっかり待つ。
const OVERPASS_TIMEOUT_MS = 60000;

type OverpassElement = {
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
};

type OverpassResponseData = {
  elements: OverpassElement[];
};

// Overpass API にクエリを投げ、ミラーサーバーへの自動フォールバックと
// タイムアウト処理を行う共通ヘルパー。
// 全ミラーで失敗した場合は例外を throw せず null を返す(呼び出し側で
// 空配列にフォールバックし、UIにエラーを表示させないため)。
async function fetchFromOverpassWithFallback(
  query: string,
  logLabel: string
): Promise<OverpassResponseData | null> {
  for (let i = 0; i < OVERPASS_URLS.length; i++) {
    const url = OVERPASS_URLS[i];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "POST",
        body: query,
        headers: { "Content-Type": "text/plain" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn(`${logLabel} - ミラーサーバーがHTTPエラーを返却:`, {
          url,
          status: res.status,
          statusText: res.statusText,
          nextAction: i < OVERPASS_URLS.length - 1 ? "次のミラーへフォールバック" : "全ミラー失敗",
        });
        continue; // 次のミラーへフォールバック
      }

      return (await res.json()) as OverpassResponseData;
    } catch (err) {
      clearTimeout(timeoutId);

      // AbortController によるタイムアウト、ネットワークエラー(Safariの
      // 「TypeError: Load failed」含む)、CORSエラーなどをまとめてキャッチ
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      const errorMessage = err instanceof Error ? err.message : String(err);

      console.warn(`${logLabel} - ミラーサーバーへの接続に失敗:`, {
        url,
        reason: isTimeout ? `タイムアウト（${OVERPASS_TIMEOUT_MS / 1000}秒超過）` : "ネットワークエラー",
        error: errorMessage,
        errorName: err instanceof Error ? err.name : "Unknown",
        nextAction: i < OVERPASS_URLS.length - 1 ? "次のミラーへフォールバック" : "全ミラー失敗",
      });
      // 直ちに次のミラーサーバーへ再試行
      continue;
    }
  }

  // すべてのミラーサーバーへの接続が失敗
  console.warn(`${logLabel} - すべてのOverpassミラーサーバーへの接続に失敗しました。空配列を返します。`);
  return null;
}

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

function elementsToRoadSuggestions(
  elements: OverpassElement[],
  lat: number,
  lng: number
): RoadSuggestion[] {
  return elements
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
}

// 複数のOverpassクエリ(カテゴリ別・道路種別別などの小ブロック)を並行実行し、
// 1ブロックの結果が届くたびに随時マージ・ソートして onBatch で通知する。
// これにより、呼び出し元(UI)は「見つかった場所から順に」結果を受け取れる
// (プログレッシブレンダリング)。
async function fetchRoadsProgressively(
  queries: Array<{ label: string; query: string }>,
  lat: number,
  lng: number,
  maxResults: number,
  sortFn: (a: RoadSuggestion, b: RoadSuggestion) => number,
  onBatch?: (accumulated: RoadSuggestion[]) => void
): Promise<RoadSuggestion[]> {
  const accumulated = new Map<number, RoadSuggestion>();

  function commit(): RoadSuggestion[] {
    const list = Array.from(accumulated.values()).sort(sortFn).slice(0, maxResults);
    onBatch?.(list);
    return list;
  }

  await Promise.all(
    queries.map(async ({ label, query }) => {
      const data = await fetchFromOverpassWithFallback(query, label);
      if (!data) return;

      for (const road of elementsToRoadSuggestions(data.elements, lat, lng)) {
        // 複数クエリで同じ道路(way)がヒットする可能性があるため id で重複排除
        accumulated.set(road.id, road);
      }

      // このブロックの結果が届き次第、即座に途中経過を通知
      commit();
    })
  );

  return commit();
}

// 「片側2車線以上」の目安として、合計車線数4以上(往復想定)、
// または一方通行(oneway)で車線数2以上の道路を候補とする。
// 車線数が多い順→近い順に並べ替え、上位のみ返すことで候補を絞り込む。
//
// 2つの条件(車線数4以上／一方通行2車線以上)は別々のOverpassクエリとして
// 並行実行し、片方の結果が先に届いた時点で onBatch を通じて随時通知する
// (プログレッシブ表示)。
export async function findWideRoadsNear(
  lat: number,
  lng: number,
  radiusMeters = 600,
  maxResults = 5,
  onBatch?: (accumulated: RoadSuggestion[]) => void
): Promise<RoadSuggestion[]> {
  const queries = [
    {
      label: "駐車候補道路検索(4車線以上)",
      query: `
        [out:json][timeout:25];
        (
          way["highway"]["lanes"~"^[4-9]$"](around:${radiusMeters},${lat},${lng});
        );
        out geom;
      `,
    },
    {
      label: "駐車候補道路検索(一方通行2車線以上)",
      query: `
        [out:json][timeout:25];
        (
          way["highway"]["oneway"="yes"]["lanes"~"^[2-9]$"](around:${radiusMeters},${lat},${lng});
        );
        out geom;
      `,
    },
  ];

  try {
    return await fetchRoadsProgressively(
      queries,
      lat,
      lng,
      maxResults,
      // 車線数が多い順、同じ車線数なら現場に近い順
      (a, b) => b.lanes - a.lanes || a.distanceMeters - b.distanceMeters,
      onBatch
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.warn("駐車候補道路検索に失敗:", { error: errorMessage, stack: err instanceof Error ? err.stack : undefined });
    return [];
  }
}

// 「駐停車」向け: 長時間の駐車と違い、短時間止められればいいので
// 車線数の条件は設けず、現場のすぐ近くにある一般道路を候補として探す。
// 車線数タグの有無に依存しないため、駐車候補より見つかりやすい。
//
// 道路種別を「幹線道路」「生活道路」の2ブロックに分けて並行実行し、
// 先に届いたブロックから onBatch を通じて随時通知する(プログレッシブ表示)。
export async function findStoppableRoadsNear(
  lat: number,
  lng: number,
  radiusMeters = 150,
  maxResults = 5,
  onBatch?: (accumulated: RoadSuggestion[]) => void
): Promise<RoadSuggestion[]> {
  const queries = [
    {
      label: "駐停車候補道路検索(幹線道路)",
      query: `
        [out:json][timeout:25];
        (
          way["highway"~"^(primary|secondary|tertiary)$"](around:${radiusMeters},${lat},${lng});
        );
        out geom;
      `,
    },
    {
      label: "駐停車候補道路検索(生活道路)",
      query: `
        [out:json][timeout:25];
        (
          way["highway"~"^(residential|unclassified|living_street)$"](around:${radiusMeters},${lat},${lng});
        );
        out geom;
      `,
    },
  ];

  try {
    return await fetchRoadsProgressively(
      queries,
      lat,
      lng,
      maxResults,
      // 駐停車は車線数を問わず、とにかく近い順
      (a, b) => a.distanceMeters - b.distanceMeters,
      onBatch
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.warn("駐停車候補道路検索に失敗:", { error: errorMessage, stack: err instanceof Error ? err.stack : undefined });
    return [];
  }
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
