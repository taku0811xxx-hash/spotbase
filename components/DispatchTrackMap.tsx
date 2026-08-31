"use client";

import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";

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

// ハザードマップ(洪水浸水想定区域)のON/OFF切替ボタン。
function HazardMapToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={enabled}
      title="ハザードマップ(洪水浸水想定区域)の表示切替"
      className={`absolute right-2 top-2 sm:right-4 sm:top-4 z-[2000] flex items-center gap-1.5 rounded-full shadow-lg border px-3 py-2 text-[11px] font-semibold transition-colors pointer-events-auto ${
        enabled
          ? "bg-amber-600 border-amber-600 text-white"
          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${enabled ? "bg-white animate-pulse" : "bg-gray-400"}`}
      />
      ハザードマップ{enabled ? "ON" : "OFF"}
    </button>
  );
}

export default function DispatchTrackMap({ track }: Props) {
  const positions: [number, number][] = track.map((p) => [p.lat, p.lng]);
  const initialCenter: [number, number] = positions[0] || [35.681236, 139.767125];
  const [showHazardMap, setShowHazardMap] = useState(false);

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

      {/* ハザードマップ(国土地理院 洪水浸水想定区域) - 下地の地図が透けて見えるようopacityを抑える */}
      {showHazardMap && (
        <TileLayer
          attribution='<a href="https://disaportal.gsi.go.jp/">ハザードマップポータルサイト</a>(国土地理院)'
          url="https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png"
          opacity={0.6}
          zIndex={10}
        />
      )}

      <HazardMapToggle enabled={showHazardMap} onToggle={() => setShowHazardMap((v) => !v)} />

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
