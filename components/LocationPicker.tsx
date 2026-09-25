"use client";

import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

type Props = {
  value: { lat: number; lng: number } | null;
  onChange: (pos: { lat: number; lng: number }) => void;
  // ピンをドラッグして位置を微調整できるようにするかどうか(デフォルトtrue)
  draggable?: boolean;
  // 地図の高さを指定するTailwindクラス(デフォルト"h-64"。広いモーダルではより
  // 大きく表示したい呼び出し元向けに上書きできるようにしている)
  heightClassName?: string;
};

function ClickHandler({ onChange }: { onChange: Props["onChange"] }) {
  useMapEvents({
    click(e) {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

// valueが外部(GPSボタンなど)から更新された時に、地図の表示位置も追従させる
function FlyToValue({ value }: { value: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (value) {
      map.flyTo([value.lat, value.lng], 16);
    }
  }, [value, map]);
  return null;
}

// ドラッグ可能な位置確定ピン。ドラッグ終了時のLeafletマーカー実座標を
// 直接読み取ってonChangeへ渡す(stateの1テンポ遅れを避けるため)。
function DraggableMarker({
  position,
  draggable,
  onChange,
}: {
  position: { lat: number; lng: number };
  draggable: boolean;
  onChange: Props["onChange"];
}) {
  const markerRef = useRef<L.Marker>(null);
  return (
    <Marker
      position={position}
      icon={defaultIcon}
      draggable={draggable}
      ref={markerRef}
      eventHandlers={{
        dragend: () => {
          const marker = markerRef.current;
          if (!marker) return;
          const pos = marker.getLatLng();
          onChange({ lat: pos.lat, lng: pos.lng });
        },
      }}
    />
  );
}

export default function LocationPicker({
  value,
  onChange,
  draggable = true,
  heightClassName = "h-64",
}: Props) {
  return (
    <div
      className={`relative z-0 w-full rounded-lg overflow-hidden border border-gray-300 ${heightClassName}`}
    >
      <MapContainer
        center={value ?? { lat: 35.681, lng: 139.767 }}
        zoom={13}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onChange={onChange} />
        {value && <DraggableMarker position={value} draggable={draggable} onChange={onChange} />}
        <FlyToValue value={value} />
      </MapContainer>
    </div>
  );
}
