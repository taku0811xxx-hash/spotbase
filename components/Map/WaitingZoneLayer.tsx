"use client";

import { useEffect, useState } from "react";
import { FeatureGroup, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { extractWaitingZones, type WaitingZoneData } from "@/lib/waitingZone";
import LegendOverlay from "./LegendOverlay";

interface Props {
  lat?: number;
  lng?: number;
  show?: boolean;
}

export default function WaitingZoneLayer({ lat, lng, show = false }: Props) {
  const map = useMap();
  const [zoneData, setZoneData] = useState<WaitingZoneData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!show || lat === undefined || lng === undefined) {
      return;
    }

    setLoading(true);
    extractWaitingZones(lat, lng)
      .then((data) => {
        setZoneData(data);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Failed to extract waiting zones:", error);
        setLoading(false);
      });
  }, [lat, lng, show]);

  if (!show) {
    return null;
  }

  return (
    <>
      {/* 凡例オーバーレイ */}
      <LegendOverlay show={show} />

      {/* ゾーンデータ表示 */}
      {zoneData && (
      <FeatureGroup>
      {/* 降機材（車寄せ）スポット - 青色マーカー */}
      {zoneData.dropoffSpots.map((spot, idx) => (
        <Marker
          key={`dropoff-${idx}`}
          position={[spot.geometry.coordinates[1], spot.geometry.coordinates[0]]}
          icon={L.icon({
            iconUrl: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCAzMiA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMTYgMEMxMi42ODYzIDAgOSA1LjAxIDkgMTFDOSAxNS45OTggMTYgMzIgMTYgMzJTMjMgMTUuOTk4IDIzIDExQzIzIDUuMDEgMTkuMzEzNyAwIDE2IDBaIiBmaWxsPSIjMjU2Zjc1Ii8+PC9zdmc+",
            iconSize: [32, 48],
            iconAnchor: [16, 48],
            popupAnchor: [0, -48],
          })}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-semibold text-blue-600">{spot.properties.name}</p>
              <p className="text-xs text-gray-600">距離: {spot.properties.distance.toFixed(1)}m</p>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* 乗車待機推奨ライン - 緑色太線 */}
      {zoneData.waitingLines.map((line, idx) => (
        <Polyline
          key={`waiting-${idx}`}
          positions={line.geometry.coordinates.map((coord) => [coord[1], coord[0]])}
          color="#22c55e"
          weight={6}
          opacity={0.7}
          dashArray="5, 5"
        >
          <Popup>
            <div className="text-sm">
              <p className="font-semibold text-green-600">乗車待機推奨ライン</p>
              <p className="text-xs text-gray-600">道路種別: {line.properties.roadType}</p>
              <p className="text-xs text-gray-600">距離: {line.properties.distance.toFixed(1)}m</p>
            </div>
          </Popup>
        </Polyline>
      ))}

      {/* ローディング表示 */}
      {loading && (
        <div className="absolute bottom-4 left-4 bg-white px-3 py-2 rounded-lg shadow-lg text-xs text-gray-600 z-[1000]">
          周辺の道路情報を取得中...
        </div>
      )}
      </FeatureGroup>
      )}
    </>
  );
}
