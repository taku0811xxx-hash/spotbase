"use client";

// 「ここトレ！」(photoモード)専用の地図表示。SpotBase本体のcomponents/Map.tsx
// (Pin型・pro向け機能を多数抱える2000行超のコンポーネント)には依存せず、
// PhotoSpot型専用の軽量な表示のみを持つ独立コンポーネントとして分離する。
import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PhotoSpot } from "@/lib/types/photoSpot";

const spotIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

// 駐車場サブピン: 撮影スポット本体のマーカーと見分けやすいよう、
// 青い円形に「P」の文字を入れたdivIconにする(画像アセットを増やさず軽量に実装)。
const parkingIcon = L.divIcon({
  className: "",
  html: `<div style="
    width: 22px; height: 22px; border-radius: 9999px;
    background: #2563eb; color: white; font-size: 12px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  ">P</div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -11],
});

type Props = {
  spot: PhotoSpot;
};

// 写真をクリックして選択スポットが変わるたびに、その撮影場所へアニメーション付きで
// 移動し(flyTo)、移動完了後にピンのポップアップを自動で開いてフォーカスを明示する。
function FlyToSpot({ spot, onArrived }: { spot: PhotoSpot; onArrived: () => void }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([spot.lat, spot.lng], 16, { duration: 0.8 });
    const timer = setTimeout(onArrived, 850);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot.id, spot.lat, spot.lng, map]);
  return null;
}

export default function PhotoSpotMap({ spot }: Props) {
  // 駐車場サブピンは既定でON(位置情報を持つものだけが対象)。地図が煩雑になる場合は
  // このトグルで非表示にできる。
  const [showParking, setShowParking] = useState(true);
  const parkingLotsWithPosition = (spot.parkingLots ?? []).filter(
    (lot): lot is typeof lot & { lat: number; lng: number } => lot.lat != null && lot.lng != null
  );
  const spotMarkerRef = useRef<L.Marker | null>(null);

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={[spot.lat, spot.lng]}
        zoom={16}
        className="w-full h-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[spot.lat, spot.lng]} icon={spotIcon} ref={spotMarkerRef}>
          <Popup>
            <div className="text-sm">
              <p className="font-semibold">{spot.name}</p>
              <p className="text-gray-500">{spot.address}</p>
            </div>
          </Popup>
        </Marker>
        {showParking &&
          parkingLotsWithPosition.map((lot, i) => (
            <Marker key={`${lot.name}-${i}`} position={[lot.lat, lot.lng]} icon={parkingIcon}>
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">🚗 {lot.name}</p>
                  <p className="text-gray-500">
                    {lot.distance}
                    {lot.capacity && ` ・ ${lot.capacity}`}
                  </p>
                  {lot.note && <p className="text-amber-700 text-xs mt-1">⚠ {lot.note}</p>}
                </div>
              </Popup>
            </Marker>
          ))}
        <FlyToSpot spot={spot} onArrived={() => spotMarkerRef.current?.openPopup()} />
      </MapContainer>

      {parkingLotsWithPosition.length > 0 && (
        <button
          onClick={() => setShowParking((v) => !v)}
          className={`absolute top-2 right-2 z-[1000] text-xs font-semibold px-2.5 py-1.5 rounded-full shadow-sm border transition-colors ${
            showParking
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-600 border-gray-300"
          }`}
        >
          🅿️ 駐車場を{showParking ? "隠す" : "表示"}
        </button>
      )}
    </div>
  );
}
