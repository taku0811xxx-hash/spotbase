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

// 現在地(GPS)用のアイコン。青い光暈付きのドットで、他のピンと混同しないようにする。
const userLocationIcon = L.divIcon({
  className: "",
  html: `
    <div style="position:relative;width:22px;height:22px;">
      <div style="position:absolute;inset:-8px;border-radius:9999px;background:rgba(37,99,235,0.25);"></div>
      <div style="position:absolute;inset:0;border-radius:9999px;background:#2563eb;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>
    </div>
  `,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -11],
});

type SearchMarker = { lat: number; lng: number; label: string; address: string };

/**
 * 座標の有効性をチェックするヘルパー関数
 * @param lat - 緯度
 * @param lng - 経度
 * @returns 座標が有効な場合 true、無効な場合 false
 */
function isValidCoordinate(lat: any, lng: any): boolean {
  const numLat = Number(lat);
  const numLng = Number(lng);

  return (
    Number.isFinite(numLat) &&
    Number.isFinite(numLng) &&
    !isNaN(numLat) &&
    !isNaN(numLng) &&
    numLat >= -90 &&
    numLat <= 90 &&
    numLng >= -180 &&
    numLng <= 180
  );
}

/**
 * 座標を堅牢に抽出するヘルパー関数
 * 複数のプロパティ名形式、ネスト構造、GeoJSON、配列形式に対応
 * @param obj - 座標を含むオブジェクト
 * @returns { lat: number, lng: number } | null
 */
function extractLatLng(obj: any): { lat: number; lng: number } | null {
  if (!obj || typeof obj !== "object") {
    return null;
  }

  // 直接のプロパティまたはネストされた座標オブジェクトに対応
  const target = obj.location || obj.coords || obj.geometry || obj;

  let lat = target.lat ?? target.latitude;
  let lng = target.lng ?? target.longitude ?? target.lon;

  // GeoJSON 形式: coordinates: [lng, lat]
  if (Array.isArray(target.coordinates) && target.coordinates.length >= 2) {
    lng = target.coordinates[0];
    lat = target.coordinates[1];
  }

  // 配列形式: [lat, lng]
  if (Array.isArray(target) && target.length >= 2) {
    lat = target[0];
    lng = target[1];
  }

  // 数値に変換
  const numLat = Number(lat);
  const numLng = Number(lng);

  // 厳格なバリデーション
  if (
    Number.isFinite(numLat) &&
    Number.isFinite(numLng) &&
    !isNaN(numLat) &&
    !isNaN(numLng) &&
    numLat >= -90 &&
    numLat <= 90 &&
    numLng >= -180 &&
    numLng <= 180
  ) {
    return { lat: numLat, lng: numLng };
  }

  return null;
}

type Props = {
  pins: Pin[];
  center?: [number, number];
  flyTo?: { lat: number; lng: number } | null;
  searchMarker?: SearchMarker | null;
  onSelectPin?: (pin: Pin) => void;
  selectedPin?: Pin | null; // 現在選択中のピン（戻るボタン用）
  showDetailPanel?: boolean; // 詳細パネル開閉状態
  roadSuggestions?: RoadSuggestion[]; // 駐車の候補道路
  stopSuggestions?: RoadSuggestion[]; // 駐停車の候補道路
  hoveredRoadKey?: string | null; // 一覧でホバー中の道路(park-123 / stop-456 の形式)
  incidents?: Incident[]; // 速報事案
  breakingAlerts?: BreakingAlert[]; // 未確認速報ピン
  userLocation?: { lat: number; lng: number } | null; // ログイン時に取得した現在地(GPS)
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

// 詳細パネル開閉時に地図をリサイズして再センタリング
function PanelResizeHandler({ showDetailPanel, selectedPin }: { showDetailPanel: boolean; selectedPin: any | null }) {
  const map = useMap();
  useEffect(() => {
    // 詳細パネル開閉時に map.invalidateSize() を実行
    map.invalidateSize();

    // アニメーション完了を待ってから再度 invalidateSize() と再センタリング
    const timeoutId = setTimeout(() => {
      map.invalidateSize();

      // 選択中のピンが存在する場合は再センタリング
      if (selectedPin && selectedPin.lat && selectedPin.lng) {
        if (!isValidCoordinate(selectedPin.lat, selectedPin.lng)) return;

        const latlng = L.latLng(selectedPin.lat, selectedPin.lng);
        try {
          map.setView(latlng, map.getZoom(), { animate: true });
        } catch (error) {
          console.error("PanelResizeHandler: setView エラー", error);
        }
      }
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [showDetailPanel, selectedPin, map]);
  return null;
}

// 検索結果などで特定の場所にフォーカスした時に地図を移動させるための内部コンポーネント
function FlyToLocation({ target }: { target: any | null | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;

    // 座標を堅牢に抽出
    const coords = extractLatLng(target);

    // 有効な座標が取得できない場合は、絶対に flyTo を呼び出さずに return
    if (!coords) {
      return;
    }

    // 最終確認: 座標が本当に有効であることをもう一度チェック
    if (!isValidCoordinate(coords.lat, coords.lng)) {
      return;
    }

    // レンダリング完了後に確実に中心移動するため、わずかな遅延を設定
    // クロージャで coords を保存して、変更の影響を受けないようにする
    const savedLat = coords.lat;
    const savedLng = coords.lng;

    setTimeout(() => {
      // 最後のセーフティチェック: 座標が本当に有効であることを確認
      if (!isValidCoordinate(savedLat, savedLng)) {
        return;
      }

      // Leaflet に L.latLng オブジェクトとして明示的に渡す
      const latlng = L.latLng(savedLat, savedLng);

      // setView を使用して地図を移動（flyTo のバージョン依存問題を回避）
      try {
        map.setView(latlng, 16, { animate: true, duration: 1.2 });
      } catch (error) {
        console.error("FlyToLocation: 地図移動エラー", { error, savedLat, savedLng });
      }
    }, 100);
  }, [target, map]);
  return null;
}

// ピン選択時に地図の中心を自動設定するコンポーネント
function FlyToSelectedPin({ selectedPin }: { selectedPin: any | null | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (!selectedPin) return;

    // 座標を堅牢に抽出
    const coords = extractLatLng(selectedPin);

    // 有効な座標が取得できない場合は、絶対に flyTo を呼び出さずに return
    if (!coords) {
      return;
    }

    // 最終確認: 座標が本当に有効であることをもう一度チェック
    if (!isValidCoordinate(coords.lat, coords.lng)) {
      return;
    }

    // レンダリング完了後に確実に中心移動するため、わずかな遅延を設定
    // クロージャで coords を保存して、変更の影響を受けないようにする
    const savedLat = coords.lat;
    const savedLng = coords.lng;

    setTimeout(() => {
      // 最後のセーフティチェック: 座標が本当に有効であることを確認
      if (!isValidCoordinate(savedLat, savedLng)) {
        return;
      }

      // Leaflet に L.latLng オブジェクトとして明示的に渡す
      const latlng = L.latLng(savedLat, savedLng);

      // setView を使用して地図を移動（flyTo のバージョン依存問題を回避）
      try {
        map.setView(latlng, 16, { animate: true, duration: 1.2 });
      } catch (error) {
        console.error("FlyToSelectedPin: 地図移動エラー", { error, savedLat, savedLng });
      }
    }, 100);
  }, [selectedPin, map]);
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

export default function Map({
  pins,
  center = [35.681, 139.767],
  flyTo,
  searchMarker,
  onSelectPin,
  selectedPin,
  showDetailPanel = false,
  roadSuggestions = [],
  stopSuggestions = [],
  hoveredRoadKey = null,
  incidents = [],
  breakingAlerts = [],
  userLocation = null,
}: Props) {
  return (
    <>
      <MapStyleInjector />

      {/* 凡例ボックス - 地図右上に配置
          注意: Leaflet内部のレイヤー(タイルペイン z-200、オーバーレイ z-400、
          ポップアップペイン z-700、ズームコントロール等 z-1000)は、この
          凡例divの兄弟要素(.leaflet-containerの子)として同じスタッキング
          コンテキストで競合するため、それらすべてを上回るz-indexが必須。
          (.leaflet-containerはposition:relativeのみでz-indexを持たず、
          新しいスタッキングコンテキストを作らないため) */}
      <div className="absolute top-4 right-4 z-[2000] bg-white rounded-lg shadow-lg border border-gray-200 p-2.5 sm:p-3 max-w-[170px] sm:max-w-xs pointer-events-auto">
        <h3 className="text-xs font-bold text-gray-900 mb-2">駐車・駐停車</h3>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 rounded flex-shrink-0" style={{ backgroundColor: '#2563eb' }}></div>
            <span className="text-xs text-gray-700">駐車候補（広い道路）</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 rounded flex-shrink-0" style={{ backgroundColor: '#f59e0b' }}></div>
            <span className="text-xs text-gray-700">駐停車候補（短時間）</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">現地で必ず確認してください</p>
      </div>

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
      {/* 選択ピン自動センタリング - ピン選択時に地図の中心を設定 */}
      <FlyToSelectedPin selectedPin={selectedPin} />
      {/* 詳細パネル開閉時のリサイズ処理 */}
      <PanelResizeHandler showDetailPanel={showDetailPanel} selectedPin={selectedPin} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        keepBuffer={2}
        updateWhenIdle={true}
        updateInterval={200}
      />
      {pins
        .filter((pin) => isValidCoordinate(pin.lat, pin.lng))
        .map((pin) => (
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

      {userLocation && isValidCoordinate(userLocation.lat, userLocation.lng) && (
        <Marker
          position={[userLocation.lat, userLocation.lng]}
          icon={userLocationIcon}
        >
          <Popup>現在地</Popup>
        </Marker>
      )}

      {searchMarker && isValidCoordinate(searchMarker.lat, searchMarker.lng) && (
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

      {incidents
        .filter((incident) => isValidCoordinate(incident.latitude, incident.longitude))
        .map((incident) => (
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

      {breakingAlerts
        .filter((alert) => isValidCoordinate(alert.lat, alert.lng))
        .map((alert) => (
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
      </MapContainer>
    </>
  );
}
