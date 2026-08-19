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

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("format", "json");
  url.searchParams.set("countrycodes", "jp"); // 日本国内に限定
  url.searchParams.set("accept-language", "ja");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "10"); // より多くの候補を取得して精度向上

  // 日本全国を網羅しつつ、関東圏(東京・神奈川・埼玉・千葉)を中心に絞り込み
  // viewbox = [西経度, 南緯度, 東経度, 北緯度]
  // 関東圏を中心とした広い範囲を指定
  url.searchParams.set("viewbox", "138.4,34.0,141.5,36.5");
  url.searchParams.set("bounded", "1"); // viewbox内の結果を優先

  const res = await fetch(url.toString(), {
    headers: {
      // Nominatimの利用ポリシー上、リファラかUser-Agentでの識別が推奨されている
      "Accept-Language": "ja",
      "User-Agent": "SpotBase/1.0 (Broadcast location management system)",
    },
  });

  if (!res.ok) {
    console.error(`ジオコーディングAPI エラー: ${res.status}`);
    return [];
  }

  const data = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
    address?: NominatimAddress;
    importance?: number; // スコア
  }>;

  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }

  // 結果をフィルタリング：日本国内かつ重要度が高いものを優先
  const results = data
    .filter((d) => {
      const lat = parseFloat(d.lat);
      const lng = parseFloat(d.lon);
      // 日本の座標範囲チェック（北緯: 30-46, 東経: 130-146）
      return lat >= 30 && lat <= 46 && lng >= 130 && lng <= 146;
    })
    .map((d) => ({
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
      displayName: formatJapaneseAddress(d.address, d.display_name),
      importance: d.importance ?? 0,
    }))
    .sort((a, b) => b.importance - a.importance) // 重要度でソート
    .slice(0, 5); // 上位5件を返す

  return results.map(({ lat, lng, displayName }) => ({ lat, lng, displayName }));
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
}
