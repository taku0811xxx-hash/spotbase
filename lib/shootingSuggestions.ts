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
  lng: number
): Promise<ShootingSuggestion[]> {
  const [osmFeatures, wikiSummary] = await Promise.all([
    fetchNearbyOsmFeatures(lat, lng),
    fetchWikipediaSummary(lat, lng),
  ]);

  const res = await fetch("/api/suggest-shooting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, address, osmFeatures, wikiSummary }),
  });

  if (!res.ok) {
    throw new Error("AI提案の取得に失敗しました");
  }

  const data = await res.json();
  return data.suggestions as ShootingSuggestion[];
}
