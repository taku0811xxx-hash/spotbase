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
  // 初期表示で現在地を優先するかどうか(デフォルトtrue)。app/map/page.tsxの
  // 全体マップ(周辺を探す用途)ではtrueのままでよいが、マイページの
  // 「マイ撮影マップ」は自分の投稿の分布を一望する用途のため、現在地優先を
  // 無効化し常に全ピン俯瞰(fitBounds)を使う。
  preferCurrentLocation?: boolean;
  // fitBounds時の余白。app/map/page.tsxの全画面マップは絶対配置のフィルター
  // バーと重なるため大きめの既定値(FIT_BOUNDS_PADDING_TOP_LEFT/BOTTOM_RIGHT)を
  // 使うが、マイページ等の小さく埋め込まれたマップではそのままだと余白が
  // 過大になるため、呼び出し元から控えめな値を渡せるようにする。
  fitBoundsPaddingTopLeft?: [number, number];
  fitBoundsPaddingBottomRight?: [number, number];
};

const TOKYO_STATION: [number, number] = [35.6812, 139.7671];

// ピンが1つも無い場合のデフォルト中心・ズーム(広域表示)
const EMPTY_MAP_ZOOM = 11;
// 現在地を中心に表示する際のズーム
const CURRENT_LOCATION_ZOOM = 12;
// 全ピン俯瞰(fitBounds)時、1件しか無い等でズームが際限なく深くなりすぎないための上限
const FIT_BOUNDS_MAX_ZOOM = 14;
// ピンがちょうど1件だけの場合に使う適度なズーム(fitBoundsだと1点に対して
// 過剰に寄ってしまうため、setViewで固定ズームを使う)
const SINGLE_SPOT_ZOOM = 13;
// fitBounds時の余白。上部はapp/map/page.tsxの絞り込みフィルターバー(地図に
// 重ねて絶対配置されている)にピンが隠れないよう大きめに、下部はボトムナビゲーション
// バー分のゆとりを確保する(ボトムナビ自体は地図コンテナのCSS padding-bottomで
// 除外済みだが、ズームコントロールとの兼ね合いも含めて余裕を持たせる)。
const FIT_BOUNDS_PADDING_TOP_LEFT: [number, number] = [40, 120];
const FIT_BOUNDS_PADDING_BOTTOM_RIGHT: [number, number] = [40, 90];
// 現在地取得を待つ最大時間。特定のエリア(例: 箱根)にピンが偏っていても、
// 常にそこへ寄ってしまわないよう、現在地が取れる場合は必ずそちらを優先する。
const GEOLOCATION_TIMEOUT_MS = 5000;

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
// まだ空配列([])で、その後spotsが更新されても地図は追従しない。そのため、
// 以下の優先順位で明示的にmap.setView/fitBoundsを呼び、初期表示を確定させる
// (適用は初回の1回のみ):
//   優先1: preferCurrentLocationが有効(デフォルト)で端末の現在地が取得できれば、
//          それを中心に表示する(特定のエリアにピンが偏っていても、常にそこへ
//          寄ってしまうのを防ぐ)
//   優先2: 現在地が使えない場合(または無効化されている場合)、登録されている
//          全ピンが画面内に収まるようfitBoundsで広域表示する。ピンがちょうど
//          1件の場合はfitBoundsだと寄りすぎるため、setViewで適度なズームにする
//   優先3: ピンが1件も無い場合のみ、デフォルト座標(東京駅周辺)のまま
function InitialViewOnLoad({
  spots,
  preferCurrentLocation = true,
  fitBoundsPaddingTopLeft = FIT_BOUNDS_PADDING_TOP_LEFT,
  fitBoundsPaddingBottomRight = FIT_BOUNDS_PADDING_BOTTOM_RIGHT,
}: {
  spots: PhotoSpot[];
  preferCurrentLocation?: boolean;
  fitBoundsPaddingTopLeft?: [number, number];
  fitBoundsPaddingBottomRight?: [number, number];
}) {
  const map = useMap();
  const appliedRef = useRef(false);
  // 優先1(現在地取得)の完了を待ってから優先2を判定するためのフラグ。
  // stateではなくrefにしているのは、値の変化そのものでは再描画を必要とせず、
  // 単に「もう待たなくてよい」という事実だけを後続の判定に伝えたいため。
  const geoSettledRef = useRef(false);
  const spotsRef = useRef(spots);
  useEffect(() => {
    spotsRef.current = spots;
  }, [spots]);

  function applyFitBoundsIfReady() {
    if (appliedRef.current) return;
    if (!geoSettledRef.current) return; // 現在地の判定が終わるまでは優先2を実行しない
    const currentSpots = spotsRef.current;
    if (currentSpots.length === 0) return;
    appliedRef.current = true;
    // 地図描画直後はコンテナの幅・高さがまだ確定していないことがあり、その状態で
    // fitBounds/setViewすると誤ったピクセルサイズを基準に計算されて画面端の
    // ピンが見切れることがある。invalidateSizeで実サイズを再計測させてから適用する。
    map.invalidateSize();
    if (currentSpots.length === 1) {
      const only = currentSpots[0];
      window.setTimeout(() => {
        map.setView([only.lat, only.lng], SINGLE_SPOT_ZOOM);
      }, 100);
      return;
    }
    const bounds = L.latLngBounds(currentSpots.map((s) => [s.lat, s.lng] as [number, number]));
    window.setTimeout(() => {
      map.fitBounds(bounds, {
        paddingTopLeft: fitBoundsPaddingTopLeft,
        paddingBottomRight: fitBoundsPaddingBottomRight,
        maxZoom: FIT_BOUNDS_MAX_ZOOM,
      });
    }, 100);
  }

  // 優先1: 現在地(マウント時に1度だけ試行。preferCurrentLocation=falseの場合は
  // 試行せず、即座に優先2の判定へ進む)
  useEffect(() => {
    let cancelled = false;
    async function run() {
      let position: GeolocationPosition | null = null;
      if (preferCurrentLocation && typeof navigator !== "undefined" && navigator.geolocation) {
        position = await new Promise<GeolocationPosition | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
            timeout: GEOLOCATION_TIMEOUT_MS,
            maximumAge: 5 * 60 * 1000,
          });
        });
      }
      if (cancelled) return;
      if (position && !appliedRef.current) {
        appliedRef.current = true;
        const { latitude, longitude } = position.coords;
        map.invalidateSize();
        window.setTimeout(() => {
          map.setView([latitude, longitude], CURRENT_LOCATION_ZOOM);
        }, 100);
      }
      geoSettledRef.current = true;
      // 現在地が使えなかった場合、既にspotsが揃っていればここで優先2へフォールバックする
      applyFitBoundsIfReady();
    }
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, preferCurrentLocation]);

  // 優先2: 現在地の判定完了後にspotsが届いた場合(または既に判定済みでspotsが
  // 後から更新された場合)も、全ピンが収まるようfitBoundsする
  useEffect(() => {
    applyFitBoundsIfReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

export default function PhotoSpotsMapView({
  spots,
  focusedSpotId,
  onMarkerClick,
  preferCurrentLocation = true,
  fitBoundsPaddingTopLeft,
  fitBoundsPaddingBottomRight,
}: Props) {
  // MapContainerのcenter/zoomは初回マウント時のみ使われる安全なデフォルト値。
  // 実際の初期表示(現在地優先→全ピン俯瞰)はマウント後にInitialViewOnLoadが
  // 非同期に決定して上書きする。
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
      center={TOKYO_STATION}
      zoom={EMPTY_MAP_ZOOM}
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
      <InitialViewOnLoad
        spots={spots}
        preferCurrentLocation={preferCurrentLocation}
        fitBoundsPaddingTopLeft={fitBoundsPaddingTopLeft}
        fitBoundsPaddingBottomRight={fitBoundsPaddingBottomRight}
      />
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
