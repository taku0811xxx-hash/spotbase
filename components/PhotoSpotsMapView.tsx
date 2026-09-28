"use client";

// 「ここトレ！」地図一覧ページ(app/map/page.tsx)専用: 全投稿写真をピンで表示する
// 全画面マップ。SpotBase本体のcomponents/Map.tsx(Pin型・pro向け機能を多数抱える)
// とは独立した、PhotoSpot専用の軽量マップコンポーネント。
//
// 狭いエリアに写真ピンが密集するとポップアップが押し合って選べなくなるため、
// react-leaflet-cluster(内部でleaflet.markercluster)でクラスタリングし、
// ズームインすると自動的に個別ピンへ分解される。
import { useEffect, useRef, type MutableRefObject } from "react";
import Link from "next/link";
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { PhotoSpot } from "@/lib/types/photoSpot";

const spotIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

// 選択中(フォーカス中)のピンを見分けやすくする強調スタイル
const activeSpotIcon = L.divIcon({
  className: "",
  html: `<div style="
    width: 30px; height: 30px; border-radius: 9999px 9999px 9999px 0;
    background: #f97316; transform: rotate(45deg);
    border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  "></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -30],
});

type Props = {
  spots: PhotoSpot[];
  // ギャラリー等から特定の写真が選ばれた時、その撮影場所へ地図をアニメーション移動させ、
  // 該当ピンを強調表示するためのID(未選択時はundefined)
  focusedSpotId?: string;
  onMarkerClick?: (spotId: string) => void;
};

const TOKYO_STATION: [number, number] = [35.6812, 139.7671];

// ピンが1つも無い場合のデフォルト中心・ズーム(広域表示)
const EMPTY_MAP_ZOOM = 11;
// ピンが密集しているエリアを中心に表示する際のズーム(概ね半径20km程度が収まる値)
const DENSITY_FOCUSED_ZOOM = 11;

// 投稿ピンの分布から、最も密集しているエリアの重心を計算する。
// 経度・緯度とも約0.2度(概ね20km四方)刻みのグリッドでビニングし、
// 最も件数の多いセル内の平均座標を「重心」として採用する簡易クラスタリング。
function computeDensityCenter(spots: PhotoSpot[]): [number, number] | null {
  if (spots.length === 0) return null;

  const CELL_SIZE_DEG = 0.2;
  const bins = new Map<string, { lat: number; lng: number }[]>();
  for (const s of spots) {
    const key = `${Math.floor(s.lat / CELL_SIZE_DEG)}:${Math.floor(s.lng / CELL_SIZE_DEG)}`;
    const bin = bins.get(key);
    if (bin) bin.push({ lat: s.lat, lng: s.lng });
    else bins.set(key, [{ lat: s.lat, lng: s.lng }]);
  }

  let densestBin: { lat: number; lng: number }[] = [];
  for (const bin of bins.values()) {
    if (bin.length > densestBin.length) densestBin = bin;
  }

  const lat = densestBin.reduce((sum, p) => sum + p.lat, 0) / densestBin.length;
  const lng = densestBin.reduce((sum, p) => sum + p.lng, 0) / densestBin.length;
  return [lat, lng];
}

// MapContainer配下でLeafletのMapインスタンスを取得し、外側(このファイルの
// マーカーclickハンドラ)から参照できるようrefへ格納するためだけの子コンポーネント。
function MapInstanceCapture({ mapRef }: { mapRef: MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);
  return null;
}

// ポップアップに表示する主要な撮影設定(F値/SS/ISO)を短い文字列に整形する
function formatSettings(spot: PhotoSpot): string | null {
  const exif = spot.exif;
  if (!exif) return null;
  const parts = [
    exif.fNumber != null ? `F${exif.fNumber}` : null,
    exif.exposureTime ? `SS ${exif.exposureTime}` : null,
    exif.iso != null ? `ISO ${exif.iso}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : null;
}

// react-leafletのMapContainerはcenter/zoom propを初回マウント時にしか反映しない
// (以降のprop変更は無視される、いわゆる"uncontrolled"な扱い)。ここでは
// spotsがAPI等から非同期に取得されるため、MapContainerがマウントされた時点では
// まだ空配列([])で、その後spotsが更新されても地図は追従しない。
// そのため、実際にピンのデータが揃ったタイミングで明示的にmap.setViewを呼び、
// 最も密集しているエリアを中心とした初期表示へ確実に合わせる(初回の1回のみ)。
function InitialViewOnLoad({ spots }: { spots: PhotoSpot[] }) {
  const map = useMap();
  const appliedRef = useRef(false);
  useEffect(() => {
    if (appliedRef.current) return;
    if (spots.length === 0) return;
    const center = computeDensityCenter(spots);
    if (!center) return;
    map.setView(center, DENSITY_FOCUSED_ZOOM);
    appliedRef.current = true;
  }, [spots, map]);
  return null;
}

// focusedSpotIdが変わるたびに、該当スポットの座標へアニメーション付きで移動する
function FlyToFocusedSpot({ spots, focusedSpotId }: { spots: PhotoSpot[]; focusedSpotId?: string }) {
  const map = useMap();
  useEffect(() => {
    if (!focusedSpotId) return;
    const spot = spots.find((s) => s.id === focusedSpotId);
    if (!spot) return;
    map.flyTo([spot.lat, spot.lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
  }, [focusedSpotId, spots, map]);
  return null;
}

export default function PhotoSpotsMapView({ spots, focusedSpotId, onMarkerClick }: Props) {
  // 初期表示: ピンが1つも無ければ東京駅付近を広域表示、ある場合は最も密集している
  // エリアの重心を中心に、半径約20km程度が収まるズームで表示する。
  const center = computeDensityCenter(spots) ?? TOKYO_STATION;
  const initialZoom = spots.length > 0 ? DENSITY_FOCUSED_ZOOM : EMPTY_MAP_ZOOM;
  const markerRefs = useRef<Record<string, L.Marker | null>>({});
  const mapRef = useRef<L.Map | null>(null);

  // フォーカス対象のピンが決まったら、移動後にポップアップも自動で開く
  useEffect(() => {
    if (!focusedSpotId) return;
    const marker = markerRefs.current[focusedSpotId];
    if (!marker) return;
    const timer = setTimeout(() => marker.openPopup(), 850);
    return () => clearTimeout(timer);
  }, [focusedSpotId]);

  return (
    <MapContainer
      center={center}
      zoom={initialZoom}
      className="w-full h-full"
      scrollWheelZoom
      zoomControl={false}
    >
      {/* 画面左上はフィルターバー(app/map/page.tsx)が占有するため、
          ズームコントロールは干渉しない右下に配置する */}
      <ZoomControl position="bottomright" />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapInstanceCapture mapRef={mapRef} />
      <InitialViewOnLoad spots={spots} />
      <FlyToFocusedSpot spots={spots} focusedSpotId={focusedSpotId} />
      {/* 近接ピンの自動集約: 一定ズーム未満では複数ピンを「N件」の丸いクラスタにまとめ、
          ズームインすると自動的に個別ピンへ分解される */}
      <MarkerClusterGroup chunkedLoading maxClusterRadius={60}>
        {spots.map((spot) => {
          const thumbnail = spot.photoUrls?.[0];
          const settings = formatSettings(spot);
          const isFocused = spot.id === focusedSpotId;
          return (
            <Marker
              key={spot.id}
              position={[spot.lat, spot.lng]}
              icon={isFocused ? activeSpotIcon : spotIcon}
              ref={(m) => {
                markerRefs.current[spot.id] = m;
              }}
              eventHandlers={{
                // ピンタップ時、その位置が画面中央に来るようスムーズに移動する。
                // 呼び出し元がfocusedSpotIdを渡していない場合(例: マイページの
                // マイ撮影マップ)でも動くよう、ここで直接flyToする。
                click: () => {
                  const map = mapRef.current;
                  if (map) {
                    map.flyTo([spot.lat, spot.lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
                  }
                  onMarkerClick?.(spot.id);
                },
              }}
            >
              <Popup>
                <div className="w-40">
                  {thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbnail}
                      alt={spot.name}
                      className="w-full h-24 object-cover rounded-md mb-1.5"
                    />
                  )}
                  <p className="text-sm font-semibold text-gray-900 truncate">{spot.name}</p>
                  {settings && <p className="text-xs text-gray-500">{settings}</p>}
                  <Link
                    href={`/?spot=${spot.id}`}
                    className="inline-block mt-1.5 text-xs font-semibold text-orange-600 hover:text-orange-700"
                  >
                    詳細を見る →
                  </Link>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
