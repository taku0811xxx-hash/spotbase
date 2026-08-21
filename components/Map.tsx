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
import { useEffect, useState } from "react";
import type { Pin } from "@/lib/pins";
import type { RoadSuggestion } from "@/lib/roads";
import type { Incident } from "@/lib/incidents";
import type { BreakingAlert } from "@/lib/breaking/parseLocation";

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

// 未確認速報ピン用のアイコン（黄色でパルス波紋効果付き）
const breakingAlertIcon = L.divIcon({
  className: "breaking-alert-marker",
  html: `
    <style>
      @keyframes ripple {
        0%, 100% {
          box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.7);
        }
        50% {
          box-shadow: 0 0 0 10px rgba(234, 179, 8, 0);
        }
      }
      .breaking-alert-marker {
        animation: ripple 1.2s ease-in-out infinite;
      }
    </style>
    <svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="breakingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fbbf24"/>
          <stop offset="100%" stop-color="#f59e0b"/>
        </linearGradient>
      </defs>
      <ellipse cx="18" cy="44" rx="8" ry="2" fill="rgba(0,0,0,0.3)"/>
      <path d="M18 2C8 2 0 10 0 20c0 12 18 24 18 24s18-12 18-24c0-10-8-18-18-18z"
            fill="url(#breakingGrad)" stroke="#d97706" stroke-width="1.5"/>
      <circle cx="18" cy="20" r="5" fill="white" opacity="0.9"/>
      <text x="18" y="25" text-anchor="middle" font-size="12" font-weight="bold" fill="#f59e0b">!!</text>
    </svg>
  `,
  iconSize: [36, 46],
  iconAnchor: [18, 46],
  popupAnchor: [0, -42],
});

type SearchMarker = { lat: number; lng: number; label: string; address: string };

type Props = {
  pins: Pin[];
  center?: [number, number];
  flyTo?: { lat: number; lng: number } | null;
  searchMarker?: SearchMarker | null;
  onSelectPin?: (pin: Pin) => void;
  selectedPin?: Pin | null; // 現在選択中のピン（戻るボタン用）
  roadSuggestions?: RoadSuggestion[]; // 駐車の候補道路
  stopSuggestions?: RoadSuggestion[]; // 駐停車の候補道路
  hoveredRoadKey?: string | null; // 一覧でホバー中の道路(park-123 / stop-456 の形式)
  incidents?: Incident[]; // 速報事案
  breakingAlerts?: BreakingAlert[]; // 未確認速報ピン
};

// CSS for Leaflet controls positioning
const mapStyles = `
  .leaflet-control-zoom {
    margin-right: 10px;
    margin-bottom: 10px;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }
  .leaflet-control-zoom a {
    width: 36px;
    height: 36px;
    line-height: 36px;
    font-size: 18px;
  }
  @media (max-width: 767px) {
    .leaflet-control-zoom {
      margin-right: 8px;
      margin-bottom: 80px;
    }
    .leaflet-control-zoom a {
      width: 32px;
      height: 32px;
      line-height: 32px;
      font-size: 16px;
    }
  }
`;

// 地図の初期化とコンテナサイズの再計算を行うコンポーネント
// SSR/初期描画時のLeafletレンダリング遅延を防ぐ
function MapInitializer() {
  const map = useMap();
  useEffect(() => {
    // マウント直後に invalidateSize() を実行し、タイル描画を即座に開始
    // これによりタッチ操作待たずに地図が表示される
    map.invalidateSize();
  }, [map]);
  return null;
}

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

// Inject Leaflet control styles
function MapStyleInjector() {
  useEffect(() => {
    const styleTag = document.createElement("style");
    styleTag.textContent = mapStyles;
    document.head.appendChild(styleTag);
    return () => {
      document.head.removeChild(styleTag);
    };
  }, []);
  return null;
}

// 選択中のピンに戻るボタン
function ReturnToPinButton({ selectedPin }: { selectedPin: Pin | null | undefined }) {
  const map = useMap();
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    if (!selectedPin) {
      setShowButton(false);
      return;
    }

    const handleMapMove = () => {
      const center = map.getCenter();
      const distance = Math.sqrt(
        Math.pow(center.lat - selectedPin.lat, 2) +
        Math.pow(center.lng - selectedPin.lng, 2)
      );
      setShowButton(distance > 0.1);
    };

    map.on("move", handleMapMove);
    handleMapMove();

    return () => {
      map.off("move", handleMapMove);
    };
  }, [selectedPin, map]);

  if (!showButton || !selectedPin) {
    return null;
  }

  const handleReturnToPin = () => {
    map.flyTo([selectedPin.lat, selectedPin.lng], 16, {
      duration: 1.5,
      easeLinearity: 0.25,
    });
  };

  return (
    <div className="absolute bottom-20 right-4 z-[1000] pointer-events-auto">
      <button
        onClick={handleReturnToPin}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-lg hover:bg-gray-50 transition-colors active:scale-[0.95] font-medium text-sm text-gray-800 whitespace-nowrap"
      >
        <span>📍</span>
        <span className="hidden sm:inline">選択中の現場に戻る</span>
        <span className="sm:hidden">戻る</span>
      </button>
    </div>
  );
}

export default function Map({
  pins,
  center = [35.681, 139.767],
  flyTo,
  searchMarker,
  onSelectPin,
  selectedPin,
  roadSuggestions = [],
  stopSuggestions = [],
  hoveredRoadKey = null,
  incidents = [],
  breakingAlerts = [],
}: Props) {
  return (
    <>
      <MapStyleInjector />
      <MapContainer
        center={center}
        zoom={12}
        scrollWheelZoom={false}
        dragging={true}
        touchZoom={true}
        doubleClickZoom={true}
        zoomControl={true}
        className="h-full w-full pointer-events-auto"
        style={{ touchAction: "manipulation", WebkitTouchCallout: "none" }}
      >
      {/* 地図初期化コンポーネント - invalidateSize() を実行してタイル描画を即座に開始 */}
      <MapInitializer />
      {/* FlyTo コンポーネント - 検索結果などで地図を移動 */}
      <FlyToLocation target={flyTo} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        keepBuffer={2}
        updateWhenIdle={true}
        updateInterval={200}
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

      {breakingAlerts.map((alert) => (
        <Marker
          key={`alert-${alert.id}`}
          position={[alert.lat, alert.lng]}
          icon={breakingAlertIcon}
        >
          <Popup>
            <div className="space-y-2 w-64">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg font-bold text-yellow-600">⚡</span>
                  <h4 className="font-bold text-gray-900">{alert.title}</h4>
                </div>
                <p className="text-sm text-gray-700">{alert.description}</p>
                <p className="text-xs text-gray-500 mt-2">
                  📍 {alert.locationName}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  情報源: {alert.source === "bluesky" ? "Bluesky" : "RSS"}
                </p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {alert.keywords.slice(0, 3).map((keyword, idx) => (
                    <span key={idx} className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                      {keyword}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  信頼度: {alert.confidenceScore}% | 報告数: {alert.count}
                </p>
              </div>
              <div className="flex gap-2">
                <a
                  href={`/dispatch/new?lat=${alert.lat}&lng=${alert.lng}&locationName=${encodeURIComponent(
                    alert.locationName
                  )}`}
                  className="flex-1 text-center text-sm bg-yellow-600 text-white hover:bg-yellow-700 rounded px-2 py-1.5 transition-colors font-medium"
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

      {/* 選択中のピンに戻るボタン */}
      <ReturnToPinButton selectedPin={selectedPin} />
      </MapContainer>
    </>
  );
}
