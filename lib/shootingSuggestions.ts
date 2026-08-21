import { fetchNearbyOsmFeatures } from "./osmContext";
import { fetchWikipediaSummary } from "./photos";

export type ShootingSuggestion = {
  position: string;
  direction: string;
  reason: string;
};

export async function suggestShootingPositions(
  name: string,
  address: string,
  lat: number,
  lng: number,
  pinId?: string
): Promise<ShootingSuggestion[]> {
  const [osmFeatures, wikiSummary] = await Promise.all([
    fetchNearbyOsmFeatures(lat, lng),
    fetchWikipediaSummary(lat, lng),
  ]);

  const res = await fetch("/api/suggest-shooting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, address, osmFeatures, wikiSummary, pinId }),
  });

  if (!res.ok) {
    let errorMessage = "撮影ポジション提案の取得に失敗しました";
    let details = "";

    try {
      const errorData = await res.json();
      if (errorData.error) {
        errorMessage = errorData.error;
      }
      if (errorData.details) {
        details = errorData.details;
      }
    } catch {
      // JSON パース失敗時は、デフォルトメッセージとステータスを組み合わせる
      errorMessage = `撮影ポジション提案の取得に失敗しました（HTTP ${res.status}: ${res.statusText}）`;
    }

    // console に詳細情報をログ出力
    if (details) {
      console.error("[shootingSuggestions] エラー詳細:", details);
    }

    throw new Error(errorMessage);
  }

  const data = await res.json();
  return data.suggestions as ShootingSuggestion[];
}
