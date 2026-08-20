"use client";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import type { Pin } from "@/lib/pins";
import type { RoadSuggestion } from "@/lib/roads";
import type { Incident } from "@/lib/incidents";

// LeafletのデフォルトマーカーアイコンがNext.js環境だと壊れるための修正
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

// 検索でヒットした「まだ未登録の場所」用の、立体感のある赤いピンアイコン。
// 外部画像に依存せず、SVGで自前描画しているので表示崩れが起きない。
const searchIcon = L.divIcon({
  className: "",
  html: `
    <svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="pinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f87171"/>
          <stop offset="100%" stop-color="#b91c1c"/>
        </linearGradient>
        <radialGradient id="pinHighlight" cx="35%" cy="30%" r="60%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="16" cy="39" rx="7" ry="2.2" fill="rgba(0,0,0,0.35)"/>
      <path d="M16 0C7.2 0 0 7.2 0 16c0 11 16 26 16 26s16-15 16-26C32 7.2 24.8 0 16 0z"
            fill="url(#pinGrad)" stroke="#7f1d1d" stroke-width="1"/>
      <path d="M16 0C7.2 0 0 7.2 0 16c0 11 16 26 16 26s16-15 16-26C32 7.2 24.8 0 16 0z"
            fill="url(#pinHighlight)"/>
      <circle cx="16" cy="16" r="6" fill="white" opacity="0.95"/>
    </svg>
  `,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  popupAnchor: [0, -38],
});

// 速報事案用のアイコン（赤色でパルス点滅効果付き）
const incidentIcon = L.divIcon({
  className: "incident-marker",
  html: `
    <style>
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
      .incident-marker {
        animation: pulse 1.5s ease-in-out infinite;
      }
    </style>
    <svg width="40" height="50" viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="urgentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ff0000"/>
          <stop offset="100%" stop-color="#cc0000"/>
        </linearGradient>
      </defs>
      <ellipse cx="20" cy="48" rx="9" ry="2.5" fill="rgba(0,0,0,0.4)"/>
      <path d="M20 2C9 2 0 11 0 22c0 14 20 28 20 28s20-14 20-28c0-11-9-20-20-20z"
            fill="url(#urgentGrad)" stroke="#990000" stroke-width="2"/>
      <circle cx="20" cy="22" r="8" fill="white" opacity="0.95"/>
      <text x="20" y="28" text-anchor="middle" font-size="14" font-weight="bold" fill="#ff0000">!</text>
    </svg>
  `,
  iconSize: [40, 50],
  iconAnchor: [20, 50],
  popupAnchor: [0, -45],
});

type SearchMarker = { lat: number; lng: number; label: string; address: string };

type Props = {
  pins: Pin[];
  center?: [number, number];
  flyTo?: { lat: number; lng: number } | null;
  searchMarker?: SearchMarker | null;
  onSelectPin?: (pin: Pin) => void;
  roadSuggestions?: RoadSuggestion[]; // 駐車の候補道路
  stopSuggestions?: RoadSuggestion[]; // 駐停車の候補道路
  hoveredRoadKey?: string | null; // 一覧でホバー中の道路(park-123 / stop-456 の形式)
  incidents?: Incident[]; // 速報事案
};

// 検索結果などで特定の場所にフォーカスした時に地図を移動させるための内部コンポーネント
function FlyToLocation({ target }: { target: { lat: number; lng: number } | null | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lng], 16);
    }
  }, [target, map]);
  return null;
}

export default function Map({
  pins,
  center = [35.681, 139.767],
  flyTo,
  searchMarker,
  onSelectPin,
  roadSuggestions = [],
  stopSuggestions = [],
  hoveredRoadKey = null,
  incidents = [],
}: Props) {
  return (
    <MapContainer
      center={center}
      zoom={12}
      scrollWheelZoom={false}
      dragging={true}
      touchZoom={true}
      doubleClickZoom={true}
      className="h-full w-full pointer-events-auto"
      style={{ touchAction: "manipulation", WebkitTouchCallout: "none" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {pins.map((pin) => (
        <Marker
          key={pin.id}
          position={[pin.lat, pin.lng]}
          icon={defaultIcon}
          eventHandlers={{
            click: () => onSelectPin?.(pin),
          }}
        >
          <Popup>
            <div className="space-y-1">
              <p className="font-bold">{pin.name}</p>
              <p className="text-sm text-gray-600">{pin.address}</p>
            </div>
          </Popup>
        </Marker>
      ))}

      {searchMarker && (
        <Marker
          position={[searchMarker.lat, searchMarker.lng]}
          icon={searchIcon}
        >
          <Popup>
            <div className="space-y-1">
              <p className="font-bold">{searchMarker.label}</p>
              <p className="text-xs text-gray-500">まだ現場として未登録です</p>
              <a
                href={`/dispatch/new?lat=${searchMarker.lat}&lng=${searchMarker.lng}&locationName=${encodeURIComponent(
                  searchMarker.address
                )}`}
                className="inline-block mt-1 text-blue-600 underline text-sm"
              >
                ここで出動記録を作成する
              </a>
            </div>
          </Popup>
        </Marker>
      )}

      {incidents.map((incident) => (
        <Marker
          key={`incident-${incident.id}`}
          position={[incident.latitude, incident.longitude]}
          icon={incidentIcon}
        >
          <Popup>
            <div className="space-y-2 w-56">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg font-bold text-red-600">
                    {incident.urgency === "high"
                      ? "🔴"
                      : incident.urgency === "medium"
                        ? "🟡"
                        : "🔵"}
                  </span>
                  <h4 className="font-bold text-gray-900">{incident.title}</h4>
                </div>
                <p className="text-sm text-gray-700">{incident.description}</p>
                <p className="text-xs text-gray-500 mt-1">
                  📍 {incident.locationName}
                </p>
              </div>
              <div className="flex gap-2">
                <a
                  href={`/dispatch/new?incidentId=${incident.id}`}
                  className="flex-1 text-center text-sm bg-red-600 text-white hover:bg-red-700 rounded px-2 py-1.5 transition-colors font-medium"
                >
                  🎥 出動作成
                </a>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}

      {roadSuggestions.map((road) => {
        const key = `park-${road.id}`;
        const isHovered = hoveredRoadKey === key;
        return (
          <Polyline
            key={key}
            positions={road.coordinates}
            pathOptions={
              isHovered
                ? { color: "#f59e0b", weight: 9, opacity: 0.95 }
                : { color: "#2563eb", weight: 6, opacity: 0.7 }
            }
          >
            <Popup>
              <div className="space-y-1">
                <p className="font-bold">{road.name}(駐車の候補)</p>
                <p className="text-xs text-gray-500">
                  車線数(OSMデータ): {road.lanes || "不明"}
                </p>
                <p className="text-xs text-gray-400">
                  駐車できるとは限りません。現地で必ず確認してください。
                </p>
              </div>
            </Popup>
          </Polyline>
        );
      })}

      {stopSuggestions.map((road) => {
        const key = `stop-${road.id}`;
        const isHovered = hoveredRoadKey === key;
        return (
          <Polyline
            key={key}
            positions={road.coordinates}
            pathOptions={
              isHovered
                ? { color: "#f59e0b", weight: 8, opacity: 0.95 }
                : { color: "#16a34a", weight: 5, opacity: 0.7, dashArray: "6 6" }
            }
          >
            <Popup>
              <div className="space-y-1">
                <p className="font-bold">{road.name}(駐停車の候補)</p>
                <p className="text-xs text-gray-400">
                  短時間の停車向けの候補です。現地で必ず確認してください。
                </p>
              </div>
            </Popup>
          </Polyline>
        );
      })}

      <FlyToLocation target={flyTo} />
    </MapContainer>
  );
}
