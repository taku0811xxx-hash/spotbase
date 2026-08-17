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
  url.searchParams.set("countrycodes", "jp"); // 日本国内を優先
  url.searchParams.set("accept-language", "ja");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");

  const res = await fetch(url.toString(), {
    headers: {
      // Nominatimの利用ポリシー上、リファラかUser-Agentでの識別が推奨されている
      "Accept-Language": "ja",
    },
  });

  if (!res.ok) return [];

  const data = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
    address?: NominatimAddress;
  }>;

  return data.map((d) => ({
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
    displayName: formatJapaneseAddress(d.address, d.display_name),
  }));
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
