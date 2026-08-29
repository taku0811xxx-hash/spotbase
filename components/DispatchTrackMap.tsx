"use client";

import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";

// 出動記録詳細画面向けの静止した軌跡表示用マップ。
// GPS取得は行わず、保存済みのtrack(座標配列)を折れ線として再描画するだけ。

const startIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:9999px;background:#16a34a;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const endIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:9999px;background:#dc2626;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

type TrackPoint = { lat: number; lng: number; time: string };

interface Props {
  track: TrackPoint[];
}

function isMapReady(map: L.Map | null | undefined): boolean {
  if (!map) return false;
  try {
    const container = map.getContainer();
    return !!container && document.body.contains(container);
  } catch {
    return false;
  }
}

// マウント時に軌跡全体が画面内に収まるよう一度だけ表示範囲を調整する
function FitToTrack({ positions }: { positions: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (!isMapReady(map) || positions.length === 0) return;
    try {
      if (positions.length === 1) {
        map.setView(positions[0], 16);
        return;
      }
      map.fitBounds(L.latLngBounds(positions), { padding: [40, 40], maxZoom: 17 });
    } catch (error) {
      console.error("FitToTrack: 地図表示エラー", error);
    }
  }, [positions, map]);

  return null;
}

export default function DispatchTrackMap({ track }: Props) {
  const positions: [number, number][] = track.map((p) => [p.lat, p.lng]);
  const initialCenter: [number, number] = positions[0] || [35.681236, 139.767125];

  return (
    <MapContainer
      center={initialCenter}
      zoom={15}
      scrollWheelZoom={true}
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitToTrack positions={positions} />

      {positions.length > 1 && (
        <Polyline positions={positions} pathOptions={{ color: "#16a34a", weight: 4, opacity: 0.85 }} />
      )}

      {positions.length > 0 && (
        <Marker position={positions[0]} icon={startIcon}>
          <Popup>出発地点({new Date(track[0].time).toLocaleTimeString("ja-JP")})</Popup>
        </Marker>
      )}

      {positions.length > 1 && (
        <Marker position={positions[positions.length - 1]} icon={endIcon}>
          <Popup>
            最終地点({new Date(track[track.length - 1].time).toLocaleTimeString("ja-JP")})
          </Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
