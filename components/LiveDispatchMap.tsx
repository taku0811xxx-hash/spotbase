"use client";

import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";

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

export default function LiveDispatchMap({ currentLocation, targetLocation, targetLabel }: Props) {
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
