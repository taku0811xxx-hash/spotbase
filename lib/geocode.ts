// OpenStreetMapのNominatim API(無料)を使って、地名・住所から緯度経度を検索する。
// 商用の大量アクセスには向かないが、社内ツール程度の利用なら問題ない規模。
// 利用ポリシー: https://operations.osmfoundation.org/policies/nominatim/

export type GeocodeResult = {
  lat: number;
  lng: number;
  displayName: string;
};

type NominatimAddress = {
  postcode?: string;
  state?: string; // 都道府県
  city?: string;
  town?: string;
  village?: string;
  city_district?: string; // 区
  suburb?: string; // 町名など
  neighbourhood?: string;
  road?: string;
  house_number?: string;
  country?: string;
};

// Nominatimの住所要素を、日本式(都道府県→市区町村→町名→番地)の並びに組み立て直す
function formatJapaneseAddress(
  address: NominatimAddress | undefined,
  fallback: string
): string {
  if (!address) return fallback;

  const isJapan = !address.country || address.country === "日本";
  if (!isJapan) return fallback;

  const parts = [
    address.state,
    address.city ?? address.town ?? address.village,
    address.city_district,
    address.suburb ?? address.neighbourhood,
    address.road,
    address.house_number,
  ].filter(Boolean);

  if (parts.length === 0) return fallback;

  const withPostcode = address.postcode
    ? `〒${address.postcode} ${parts.join("")}`
    : parts.join("");

  return withPostcode;
}

export async function geocodeQuery(query: string): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    // バックエンド API 経由で Nominatim を呼び出す（CORS対策）
    const url = new URL("/api/geocode", typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
    url.searchParams.set("q", trimmed);

    const res = await fetch(url.toString());

    if (!res.ok) {
      console.error(`ジオコーディングAPI エラー: ${res.status}`);
      return [];
    }

    const results = (await res.json()) as GeocodeResult[];
    return results;
  } catch (err) {
    console.error("ジオコーディング処理エラー:", err);
    return [];
  }
}

// 緯度経度から住所を逆引きする(地図クリック時の住所自動入力に使用)
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "json");
  url.searchParams.set("accept-language", "ja");
  url.searchParams.set("addressdetails", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: { "Accept-Language": "ja" },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      display_name?: string;
      address?: NominatimAddress;
    };
    if (!data.display_name) return null;

    return formatJapaneseAddress(data.address, data.display_name);
  } catch (err) {
    // Safari の「TypeError: Load failed」などの通信エラーをキャッチ
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("逆ジオコーディング処理エラー:", {
      error: errorMessage,
      errorName: err instanceof Error ? err.name : "Unknown",
    });
    return null;
  }
}

// ここから: 「ここトレ！」(photoモード)専用の施設名(POI)優先ジオコーディング。
// 上のgeocodeQuery/reverseGeocodeは住所文字列(displayName)のみを返し、また
// geocodeQueryはサーバー側の/api/geocodeを経由するため、静的書き出し
// (Capacitor/photoモード)環境では動作しない。そのためphotoモードの投稿
// フロー専用に、Nominatimへ直接アクセスして施設名と住所を別々に返す
// 実装を用意する(reverseGeocodeと同じくクライアント直叩き方式)。

export type PoiGeocodeResult = {
  lat: number;
  lng: number;
  // 施設名・POI名(例: "井の頭恩賜公園")。取得できない場合はaddressと同じ値になる
  locationName: string;
  // 正式な住所(都道府県〜番地)
  address: string;
};

type NominatimPoiAddress = NominatimAddress & {
  attraction?: string;
  tourism?: string;
  leisure?: string;
  amenity?: string;
  shop?: string;
  historic?: string;
  building?: string;
  natural?: string;
};

type NominatimPlace = {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  namedetails?: { name?: string; "name:ja"?: string };
  address?: NominatimPoiAddress;
};

// 施設名(POI)を優先度順に探す: namedetails/nameの固有名 → address内のPOIカテゴリ
// (観光名所・レジャー施設・店舗等)の順。どちらも無ければnullを返し、呼び出し元で
// 住所文字列にフォールバックする。
const POI_ADDRESS_KEYS: (keyof NominatimPoiAddress)[] = [
  "attraction",
  "tourism",
  "leisure",
  "amenity",
  "shop",
  "historic",
  "building",
  "natural",
];

function extractPoiName(place: NominatimPlace): string | null {
  const named = place.namedetails?.["name:ja"] || place.namedetails?.name || place.name;
  if (named) return named;
  if (place.address) {
    for (const key of POI_ADDRESS_KEYS) {
      const value = place.address[key];
      if (value) return value;
    }
  }
  return null;
}

function toPoiResult(place: NominatimPlace): PoiGeocodeResult {
  const address = formatJapaneseAddress(place.address, place.display_name);
  return {
    lat: parseFloat(place.lat),
    lng: parseFloat(place.lon),
    locationName: extractPoiName(place) ?? address,
    address,
  };
}

// 施設名・住所などのキーワードで検索し、位置情報と正式住所を取得する(順ジオコーディング)。
// クライアントから直接Nominatimへリクエストするため、静的書き出し環境でも動作する。
export async function geocodeQueryPoi(query: string): Promise<PoiGeocodeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", trimmed);
    url.searchParams.set("format", "json");
    url.searchParams.set("countrycodes", "jp");
    url.searchParams.set("accept-language", "ja");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("namedetails", "1");
    url.searchParams.set("limit", "10");
    url.searchParams.set("viewbox", "138.4,34.0,141.5,36.5");
    url.searchParams.set("bounded", "1");

    const res = await fetch(url.toString(), { headers: { "Accept-Language": "ja" } });
    if (!res.ok) {
      console.error(`施設名検索APIエラー: ${res.status}`);
      return [];
    }

    const data = (await res.json()) as Array<NominatimPlace & { importance?: number }>;
    if (!Array.isArray(data)) return [];

    return data
      .filter((d) => {
        const lat = parseFloat(d.lat);
        const lng = parseFloat(d.lon);
        // 日本の座標範囲チェック(北緯: 30-46, 東経: 130-146)
        return lat >= 30 && lat <= 46 && lng >= 130 && lng <= 146;
      })
      .map((d) => ({ ...toPoiResult(d), importance: d.importance ?? 0 }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 5)
      .map(({ lat, lng, locationName, address }) => ({ lat, lng, locationName, address }));
  } catch (err) {
    console.error("施設名検索処理エラー:", err);
    return [];
  }
}

// 緯度経度から施設名(POI)優先で場所名を逆引きする(逆ジオコーディング)。
// zoom=18を指定し、行政区画ではなく建物・施設単位までの詳細な粒度で解決させる。
export async function reverseGeocodePoi(lat: number, lng: number): Promise<PoiGeocodeResult | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "json");
  url.searchParams.set("accept-language", "ja");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("namedetails", "1");
  url.searchParams.set("zoom", "18");

  try {
    const res = await fetch(url.toString(), { headers: { "Accept-Language": "ja" } });
    if (!res.ok) return null;
    const data = (await res.json()) as NominatimPlace;
    if (!data.display_name) return null;
    return toPoiResult(data);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("施設名逆引き処理エラー:", { error: errorMessage });
    return null;
  }
}
