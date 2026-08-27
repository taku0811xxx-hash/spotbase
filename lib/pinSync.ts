import { getDispatchRecordsNear } from "./dispatchRecords";
import { getAllPins, createPin, updatePin } from "./pins";

type Scope = { organizationId: string; category: string; isAdmin: boolean };

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a1 = (lat1 * Math.PI) / 180;
  const a2 = (lat2 * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a1) * Math.cos(a2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 出動記録を保存した直後に呼び出す。同じ場所付近の出動記録をすべて集めてAIに要約させ、
// 既にその場所の現場記録(ピン)があれば更新、なければ新規作成する。
// エラーが起きても出動記録自体の保存には影響させない(呼び出し側でcatchする想定)。
export async function syncPinFromDispatch(
  params: {
    locationName: string;
    address: string;
    lat: number;
    lng: number;
    organizationId: string;
    category: string;
    recordedBy: string;
  },
  scope: Scope
): Promise<void> {
  const nearbyDispatches = await getDispatchRecordsNear(params.lat, params.lng, scope);
  if (nearbyDispatches.length === 0) return;

  let res: Response;
  try {
    res = await fetch("/api/generate-pin-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationName: params.locationName,
        address: params.address,
        records: nearbyDispatches.map((r) => ({
          date: r.createdAt?.toDate?.()?.toLocaleDateString("ja-JP") ?? "",
          incidentType: r.incidentType,
          parkingInfo: r.parkingInfo,
          shootingSpots: r.shootingSpots,
          ipTransmissionInfo: r.ipTransmissionInfo,
          fpuInfo: r.fpuInfo,
          hazards: r.hazards,
          notes: r.notes,
        })),
      }),
    });
  } catch (fetchError) {
    // Safari の「TypeError: Load failed」などの通信エラーをキャッチ
    // 現場記録(ピン)自動統合の失敗は、出動記録自体の保存には影響させない
    const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
    console.error("現場記録自動統合 - ネットワークエラー（fetch失敗）:", {
      error: errorMessage,
      errorName: fetchError instanceof Error ? fetchError.name : "Unknown",
    });
    return;
  }
  if (!res.ok) {
    console.error("現場記録自動統合 - HTTPエラー:", { status: res.status, statusText: res.statusText });
    return;
  }
  const { summary } = await res.json();

  // 同じ場所(半径300m以内)に既存の現場記録があれば、それを更新対象にする
  const pins = await getAllPins(scope);
  const nearby = pins
    .map((p) => ({ pin: p, distance: distanceMeters(p.lat, p.lng, params.lat, params.lng) }))
    .filter((x) => x.distance <= 300)
    .sort((a, b) => a.distance - b.distance);
  const existing = nearby[0]?.pin;

  if (existing) {
    await updatePin(existing.id, {
      name: existing.name,
      address: existing.address,
      lat: existing.lat,
      lng: existing.lng,
      parkingInfo: summary.parkingInfo ?? "",
      shootingSpots: summary.shootingSpots ?? "",
      ipTransmissionInfo: summary.ipTransmissionInfo ?? "",
      fpuInfo: summary.fpuInfo ?? "",
      hazards: summary.hazards ?? "",
      organizationId: existing.organizationId,
      category: existing.category,
      recordedBy: params.recordedBy,
      newPhotos: [],
      newShootingPhotos: [],
      newHazardPhotos: [],
    });
  } else {
    await createPin({
      name: params.locationName,
      address: params.address,
      lat: params.lat,
      lng: params.lng,
      parkingInfo: summary.parkingInfo ?? "",
      shootingSpots: summary.shootingSpots ?? "",
      ipTransmissionInfo: summary.ipTransmissionInfo ?? "",
      fpuInfo: summary.fpuInfo ?? "",
      hazards: summary.hazards ?? "",
      photos: [],
      shootingPhotos: [],
      hazardPhotos: [],
      organizationId: params.organizationId,
      category: params.category,
      recordedBy: params.recordedBy,
    });
  }
}
