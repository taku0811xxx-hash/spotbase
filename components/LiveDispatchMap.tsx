"use client";

import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";

// 出動者(自分)の現在地用アイコン - 青い光暈付きドット
const currentLocationIcon = L.divIcon({
  className: "",
  html: `
    <div style="position:relative;width:24px;height:24px;">
      <div style="position:absolute;inset:-9px;border-radius:9999px;background:rgba(37,99,235,0.25);"></div>
      <div style="position:absolute;inset:0;border-radius:9999px;background:#2563eb;border:3px solid white;box-shadow:0 1px 5px rgba(0,0,0,0.45);"></div>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

// 対象現場用アイコン - 赤いピン(立体感のあるSVG)
const targetSiteIcon = L.divIcon({
  className: "",
  html: `
    <svg width="34" height="44" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="liveTargetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f87171"/>
          <stop offset="100%" stop-color="#b91c1c"/>
        </linearGradient>
      </defs>
      <ellipse cx="16" cy="39" rx="7" ry="2.2" fill="rgba(0,0,0,0.35)"/>
      <path d="M16 0C7.2 0 0 7.2 0 16c0 11 16 26 16 26s16-15 16-26C32 7.2 24.8 0 16 0z"
            fill="url(#liveTargetGrad)" stroke="#7f1d1d" stroke-width="1.5"/>
      <circle cx="16" cy="16" r="6" fill="white" opacity="0.95"/>
    </svg>
  `,
  iconSize: [34, 44],
  iconAnchor: [17, 44],
  popupAnchor: [0, -40],
});

type LatLng = { lat: number; lng: number };

interface Props {
  currentLocation: LatLng | null;
  targetLocation: LatLng | null;
  targetLabel: string;
  onLocated?: (loc: LatLng) => void;
}

// 現在地表示ボタン - 押下時にGPSで現在地を取得し、地図の中心をスムーズに移動させる。
// 高精度測位が失敗(タイムアウト/測位不能)した場合は、自動的に標準精度(Wi-Fi/IP測位)で
// 再試行する二段階フォールバックを行う。権限拒否や両方失敗時も例外を投げず、
// console.warnに留めつつ画面上に分かりやすい通知を表示する。
function LocateControl({ onLocated }: { onLocated?: (loc: LatLng) => void }) {
  const map = useMap();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!errorMessage) return;
    const timer = setTimeout(() => setErrorMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  function describeError(error: GeolocationPositionError): string {
    if (error.code === error.PERMISSION_DENIED) {
      return "現在地の取得が許可されていません。位置情報の利用を許可してください";
    }
    return "現在地を取得できませんでした。電波状況の良い場所で再度お試しください";
  }

  function handleSuccess(pos: GeolocationPosition) {
    const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    map.setView([loc.lat, loc.lng], 16, { animate: true });
    onLocated?.(loc);
    setLoading(false);
  }

  // 標準精度(Wi-Fi/IP測位)での再試行。高精度測位のタイムアウト・測位不能時のフォールバック。
  function tryStandardAccuracy() {
    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      (error) => {
        console.warn("現在地の取得に失敗しました(標準精度):", error);
        setLoading(false);
        setErrorMessage(describeError(error));
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  function handleClick() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setErrorMessage("この端末では位置情報を利用できません");
      return;
    }
    setLoading(true);
    setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      (error) => {
        console.warn("現在地の取得に失敗しました(高精度):", error);
        // 権限拒否の場合は再試行しても無駄なので、その場でユーザーに通知する
        if (error.code === error.PERMISSION_DENIED) {
          setLoading(false);
          setErrorMessage(describeError(error));
          return;
        }
        // タイムアウト・測位不能の場合は標準精度(Wi-Fi/IP測位)で再試行する
        tryStandardAccuracy();
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-label="現在地を表示"
        title="現在地を表示"
        className="absolute left-2 bottom-24 sm:left-4 sm:bottom-8 z-[2000] w-9 h-9 sm:w-10 sm:h-10 bg-white rounded-full shadow-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-transform disabled:opacity-60 pointer-events-auto"
      >
        {loading ? (
          <span className="block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="3" fill="#2563eb" />
            <circle cx="12" cy="12" r="8" stroke="#2563eb" strokeWidth="2" />
            <line x1="12" y1="1" x2="12" y2="4" stroke="#2563eb" strokeWidth="2" />
            <line x1="12" y1="20" x2="12" y2="23" stroke="#2563eb" strokeWidth="2" />
            <line x1="1" y1="12" x2="4" y2="12" stroke="#2563eb" strokeWidth="2" />
            <line x1="20" y1="12" x2="23" y2="12" stroke="#2563eb" strokeWidth="2" />
          </svg>
        )}
      </button>

      {errorMessage && (
        <div
          role="alert"
          className="absolute left-2 right-2 bottom-[9.5rem] sm:left-4 sm:right-auto sm:bottom-[5.5rem] sm:max-w-xs z-[2000] bg-red-600 text-white text-xs sm:text-sm rounded-lg shadow-lg px-3 py-2 pointer-events-auto"
        >
          {errorMessage}
        </div>
      )}
    </>
  );
}

/**
 * 現在地・対象現場のどちらか(または両方)が更新されるたびに、
 * 両方が画面内に収まるよう地図の表示範囲を自動調整する。
 */
function AutoFitBounds({
  currentLocation,
  targetLocation,
}: Pick<Props, "currentLocation" | "targetLocation">) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = [];
    if (currentLocation) points.push([currentLocation.lat, currentLocation.lng]);
    if (targetLocation) points.push([targetLocation.lat, targetLocation.lng]);

    if (points.length === 0) return;

    if (points.length === 1) {
      map.setView(points[0], 16, { animate: true });
      return;
    }

    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [56, 56], maxZoom: 17, animate: true });
  }, [currentLocation, targetLocation, map]);

  return null;
}

export default function LiveDispatchMap({ currentLocation, targetLocation, targetLabel, onLocated }: Props) {
  const initialCenter: [number, number] = targetLocation
    ? [targetLocation.lat, targetLocation.lng]
    : currentLocation
      ? [currentLocation.lat, currentLocation.lng]
      : [35.681236, 139.767125];

  return (
    <MapContainer
      center={initialCenter}
      zoom={15}
      scrollWheelZoom={true}
      className="h-full w-full"
      style={{ touchAction: "manipulation" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <AutoFitBounds currentLocation={currentLocation} targetLocation={targetLocation} />
      <LocateControl onLocated={onLocated} />

      {currentLocation && targetLocation && (
        <Polyline
          positions={[
            [currentLocation.lat, currentLocation.lng],
            [targetLocation.lat, targetLocation.lng],
          ]}
          pathOptions={{ color: "#2563eb", weight: 3, dashArray: "6 8", opacity: 0.7 }}
        />
      )}

      {currentLocation && (
        <Marker position={[currentLocation.lat, currentLocation.lng]} icon={currentLocationIcon}>
          <Popup>現在地(自分)</Popup>
        </Marker>
      )}

      {targetLocation && (
        <Marker position={[targetLocation.lat, targetLocation.lng]} icon={targetSiteIcon}>
          <Popup>{targetLabel || "対象現場"}</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
