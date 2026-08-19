import { NextRequest, NextResponse } from "next/server";

type NominatimAddress = {
  postcode?: string;
  state?: string;
  city?: string;
  town?: string;
  village?: string;
  city_district?: string;
  suburb?: string;
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

export type GeocodeResult = {
  lat: number;
  lng: number;
  displayName: string;
};

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");

  if (!query || !query.trim()) {
    return NextResponse.json([], { status: 400 });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query.trim());
  url.searchParams.set("format", "json");
  url.searchParams.set("countrycodes", "jp");
  url.searchParams.set("accept-language", "ja");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "10");
  url.searchParams.set("viewbox", "138.4,34.0,141.5,36.5");
  url.searchParams.set("bounded", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "Accept-Language": "ja",
        "User-Agent": "SpotBase/1.0 (Broadcast location management system)",
      },
    });

    if (!res.ok) {
      console.error(`Nominatim API error: ${res.status}`);
      return NextResponse.json([], { status: 500 });
    }

    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
      address?: NominatimAddress;
      importance?: number;
    }>;

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json([]);
    }

    // 結果をフィルタリング：日本国内かつ重要度が高いものを優先
    const results: GeocodeResult[] = data
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
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 5)
      .map(({ lat, lng, displayName }) => ({ lat, lng, displayName }));

    return NextResponse.json(results);
  } catch (err) {
    console.error("Geocoding error:", err);
    return NextResponse.json([], { status: 500 });
  }
}
