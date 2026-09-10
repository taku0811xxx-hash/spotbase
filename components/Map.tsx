"use client";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Pane,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Pin } from "@/lib/pins";
import type { RoadSuggestion } from "@/lib/roads";
import type { Incident } from "@/lib/incidents";
import type { BreakingAlert } from "@/lib/breaking/parseLocation";
import type { CrewMember, CrewStatus, StayPoint } from "@/lib/dummyCrew";
import { HazardMapTileLayer, HazardMapToggle } from "./HazardMapLayer";
import {
  RainRadarTileLayer,
  RainRadarToggle,
  RainRadarPreloader,
  RainRadarTimeControl,
  useRainRadarFrames,
  WarningPolygonLayer,
  WarningLabelLayer,
  WeatherWarningToggle,
} from "./WeatherLayers";

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

// クルーピンのステータス別カラー(対応中=オレンジ/赤系、待機中=緑、移動中=青、帰社中=グレー)
const CREW_STATUS_COLOR: Record<CrewStatus, { main: string; dark: string }> = {
  現場対応中: { main: "#f97316", dark: "#c2410c" },
  移動中: { main: "#2563eb", dark: "#1d4ed8" },
  待機中: { main: "#16a34a", dark: "#15803d" },
  帰社中: { main: "#6b7280", dark: "#4b5563" },
};

// クルー用ピンアイコンをキャッシュしつつステータスごとに生成する
// (このファイルは default export のコンポーネント名が `Map` のため、
//  組み込みの Map クラスは globalThis 経由で参照する必要がある)
const crewIconCache = new globalThis.Map<CrewStatus, L.DivIcon>();
function getCrewIcon(status: CrewStatus): L.DivIcon {
  const cached = crewIconCache.get(status);
  if (cached) return cached;

  const { main, dark } = CREW_STATUS_COLOR[status] ?? CREW_STATUS_COLOR["待機中"];
  const icon = L.divIcon({
    className: "",
    html: `
      <svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="15" cy="38" rx="7" ry="2" fill="rgba(0,0,0,0.3)"/>
        <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 24 15 24s15-13.5 15-24C30 6.7 23.3 0 15 0z"
              fill="${main}" stroke="${dark}" stroke-width="1.5"/>
        <circle cx="15" cy="15" r="9" fill="white"/>
        <path d="M15 9.5a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4zM9 21.5c0-2.9 2.7-4.8 6-4.8s6 1.9 6 4.8v.6H9v-.6z" fill="${dark}"/>
      </svg>
    `,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -36],
  });
  crewIconCache.set(status, icon);
  return icon;
}

// クルー移動経路の「滞在ポイント」用アイコン(時計マーク付きの丸ピン)。
// クルー本体のピン(涙型)とは形を変えて区別できるようにする。
const stayPointIcon = L.divIcon({
  className: "",
  html: `
    <svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
      <circle cx="13" cy="13" r="11" fill="#ea580c" stroke="#7c2d12" stroke-width="2"/>
      <circle cx="13" cy="13" r="6.5" fill="white"/>
      <path d="M13 8.5v4.8l3.2 1.9" stroke="#ea580c" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -13],
});

type SearchMarker = { lat: number; lng: number; label: string; address: string };

/**
 * Leafletのmapインスタンスが「操作可能な状態」かどうかを判定する。
 *
 * setView/panTo等をコンポーネントのアンマウント後(画面遷移後)や、DOM要素の
 * レンダリングが完了する前に呼び出すと、Leaflet内部で座標キャッシュ
 * (_leaflet_pos)を参照できず "Cannot read properties of undefined
 * (reading '_leaflet_pos')" という実行時エラーになる。
 * これは主に、GPSの非同期コールバック(getCurrentPosition/watchPosition)や
 * setTimeoutが、mapがremove()された後・DOMにコンテナがまだ無い状態で
 * 発火した場合に起きる。呼び出し側は必ずこのガードを通してから
 * map操作を行うこと。
 */
function isMapReady(map: L.Map | null | undefined): boolean {
  if (!map) return false;
  try {
    // map.remove() 済み、またはまだDOMにマウントされていない場合は
    // getContainer() が null/undefined を返す(内部的には _container)
    const container = map.getContainer();
    return !!container && document.body.contains(container);
  } catch {
    // getContainer() 自体が例外を投げるケース(removeされた直後など)
    return false;
  }
}

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
  userLocation?: { lat: number; lng: number } | null; // ログイン時に取得した現在地(GPS)。出動中/一時表示中のみ渡される想定(表示ON/OFFの制御は呼び出し側で行う)
  lastKnownLocation?: { lat: number; lng: number } | null; // 直近に取得済みの現在地(表示ON/OFF状態に関わらず常に渡す)。「現在地を表示」ボタン押下時、再取得を待たずに即座にflyToするためのキャッシュとして使う
  crewMembers?: CrewMember[]; // 報道クルー/スタッフの位置情報(ダミーデータ)
  showPins?: boolean; // 現場ピンを地図上に表示するか(現場一覧メニュー開閉と連動。省略時は常時表示)
  showLegend?: boolean; // 駐車・駐停車の凡例ボックスを表示するか(詳細パネル表示時のみ等。省略時は常時表示)
  dispatchListOpen?: boolean; // 現場一覧メニューの開閉状態(地図幅が変わるためinvalidateSizeのトリガーに使う)
  onLocated?: (loc: { lat: number; lng: number }) => void; // 現在地表示ボタン押下時のコールバック
  myProfile?: { name: string; category: string; phone?: string } | null; // 自分の現在地マーカーのポップアップに表示するログインユーザー情報
  myStatus?: CrewStatus; // 自分の現在のステータス(ユーザーステータスパネルと連動)
  selfLocationHistory?: [number, number][]; // 実機watchPositionから蓄積された自分の移動経路(呼び出し側で距離フィルタリング・永続化済み)
};

// 自分の移動経路を表す特別なID。crewMembersのidと衝突しない専用の値として扱う。
const SELF_ROUTE_ID = "__self__";

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
// SSR/初期描画時のLeafletレンダリング遅延を防ぐ。
// ログイン直後などはコンテナ(親要素)のレイアウト確定・アニメーション・
// 仮想キーボードの開閉が完了する前にLeafletがサイズを計測してしまい、
// 実際のコンテナ幅とズレたまま(=拡大・はみ出しに見える)描画されることが
// あるため、マウント直後に加えて100〜300ms後にも再計測を行う。
// あわせて、画面リサイズ時・タブ/アプリのフォアグラウンド復帰時にも
// invalidateSize()を実行し、ズレを解消し続ける。
function MapInitializer() {
  const map = useMap();
  useEffect(() => {
    // マウント直後に invalidateSize() を実行し、タイル描画を即座に開始
    // これによりタッチ操作待たずに地図が表示される
    map.invalidateSize();

    // 親要素のレイアウト確定を待ってから再計測する(複数回試行することで、
    // アニメーション時間の違いや端末差を吸収する)
    const timeoutIds = [100, 200, 300].map((delay) =>
      setTimeout(() => {
        if (!isMapReady(map)) return;
        map.invalidateSize();
      }, delay)
    );

    function handleWindowResize() {
      if (!isMapReady(map)) return;
      map.invalidateSize();
    }

    function handleVisibilityChange() {
      // タブ切り替え・アプリのバックグラウンド/フォアグラウンド復帰時。
      // 非表示中はコンテナのサイズが0で計測されている可能性があるため、
      // 復帰直後に再計測する。
      if (document.visibilityState !== "visible") return;
      if (!isMapReady(map)) return;
      map.invalidateSize();
    }

    window.addEventListener("resize", handleWindowResize);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      timeoutIds.forEach(clearTimeout);
      window.removeEventListener("resize", handleWindowResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [map]);
  return null;
}

// 詳細パネル開閉時に地図をリサイズして再センタリング
function PanelResizeHandler({ showDetailPanel, selectedPin, dispatchListOpen }: { showDetailPanel: boolean; selectedPin: any | null; dispatchListOpen?: boolean }) {
  const map = useMap();
  useEffect(() => {
    // 詳細パネル開閉時に map.invalidateSize() を実行
    map.invalidateSize();

    // アニメーション完了を待ってから再度 invalidateSize() と再センタリング
    const timeoutId = setTimeout(() => {
      // タイマー発火時点でmapが既にアンマウント/remove済みでないことを確認
      // (_leaflet_pos エラー対策: コンポーネントが画面遷移等で消えた後に
      // このコールバックが呼ばれるケースがあるため)
      if (!isMapReady(map)) return;

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
  }, [showDetailPanel, selectedPin, dispatchListOpen, map]);
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

    const timeoutId = setTimeout(() => {
      // タイマー発火時点でmapが既にアンマウント/remove済みでないことを確認
      // (_leaflet_pos エラー対策)
      if (!isMapReady(map)) return;

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

    return () => clearTimeout(timeoutId);
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

    const timeoutId = setTimeout(() => {
      // タイマー発火時点でmapが既にアンマウント/remove済みでないことを確認
      // (_leaflet_pos エラー対策)
      if (!isMapReady(map)) return;

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

    return () => clearTimeout(timeoutId);
  }, [selectedPin, map]);
  return null;
}

// クルーの移動経路(path)全体が収まるよう地図の表示範囲を自動調整するコンポーネント。
// 「経路を見る」がクリックされた際に一度だけfitBoundsする。
function RouteFitBounds({ path }: { path: [number, number][] | null | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (!path || path.length === 0) return;

    const validPoints = path.filter(([lat, lng]) => isValidCoordinate(lat, lng));
    if (validPoints.length === 0) return;

    const timeoutId = setTimeout(() => {
      if (!isMapReady(map)) return;
      try {
        const bounds = L.latLngBounds(validPoints.map(([lat, lng]) => L.latLng(lat, lng)));
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16, animate: true });
      } catch (error) {
        console.error("RouteFitBounds: 地図移動エラー", error);
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [path, map]);
  return null;
}

// 現在地表示ボタン - 押下時にGPSで現在地を取得し、地図の中心をスムーズに移動させる。
// 高精度測位が失敗(タイムアウト/測位不能)した場合は、自動的に標準精度(Wi-Fi/IP測位)で
// 再試行する二段階フォールバックを行う。権限拒否や両方失敗時も例外を投げず、
// console.warnに留めつつ画面上に分かりやすい通知を表示する。
// 既に直近の現在地(lastKnownLocation)が分かっている場合は、GPS再取得を待たずに
// 即座にそこへflyToしてから、裏側で最新の位置情報取得を継続する(体感速度向上)。
function LocateControl({
  onLocated,
  lastKnownLocation,
}: {
  onLocated?: (loc: { lat: number; lng: number }) => void;
  lastKnownLocation?: { lat: number; lng: number } | null;
}) {
  const map = useMap();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // getCurrentPositionはwatchPositionと違いclearWatchで途中キャンセルできない
  // 一回きりの非同期コールバックのため、コンポーネントが既にアンマウントされた後に
  // 結果が返ってきてmap.setView等を呼んでしまう(_leaflet_posエラーの原因になる)
  // ケースをこのrefで防ぐ。
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
    // コンポーネントが既にアンマウントされている、またはmapインスタンスが
    // 既にremove()されている場合はflyTo等を呼び出さない(_leaflet_pos対策)
    if (!mountedRef.current || !isMapReady(map)) return;

    const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    console.log("[GPS Debug]", pos);
    // 位置情報の取得自体には成功しているので、直前の(あるいはキャッシュflyTo後に
    // 表示されたままの)エラー表示は確実にクリアする。地図移動処理(flyTo)側の
    // 例外は下のtry/catchで完全に切り離し、位置情報取得エラーとは混同しない。
    setErrorMessage(null);
    try {
      map.flyTo([loc.lat, loc.lng], 15, { animate: true, duration: 1.2 });
    } catch (error) {
      // flyTo自体の失敗(_leaflet_pos等の描画系エラー)はGPS取得エラーではないため、
      // ユーザー向けの「現在地取得エラー」表示は出さずコンソール警告のみに留める。
      console.warn("[GPS] 現在地へのflyToに失敗しました(位置情報取得自体は成功):", error);
    }
    onLocated?.(loc);
    setLoading(false);
  }

  // 標準精度(Wi-Fi/IP測位)での再試行。高精度測位のタイムアウト・測位不能時のフォールバック。
  // flewToCache: この操作の冒頭で既にlastKnownLocationへのflyToに成功しているかどうか。
  // 成功している場合、地図上はユーザーから見て既に「現在地に移動済み」なので、裏側の
  // 最新測位がここで失敗してもエラーバナーは出さず、コンソール警告のみに留める
  // (「地図は動いたのにエラーが出る」という誤解を防ぐため)。
  function tryStandardAccuracy(flewToCache: boolean) {
    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      (error) => {
        if (!mountedRef.current) return;
        console.warn("[GPS Error] 現在地の取得に失敗しました(標準精度):", error);
        setLoading(false);
        if (!flewToCache) {
          setErrorMessage(describeError(error));
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
    );
  }

  function handleClick() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setErrorMessage("この端末では位置情報を利用できません");
      return;
    }
    setLoading(true);
    setErrorMessage(null);

    // 直近の現在地が既に分かっていれば、GPSの再取得を待たずに即座にそこへ
    // flyToして体感速度を上げる(裏側では以下の通り最新の位置情報取得を継続し、
    // 取得でき次第もう一度flyToして精度を追従させる)。
    let flewToCache = false;
    if (lastKnownLocation && isMapReady(map)) {
      try {
        map.flyTo([lastKnownLocation.lat, lastKnownLocation.lng], 15, { animate: true, duration: 1.2 });
        flewToCache = true;
      } catch (error) {
        console.warn("[GPS] 既知の現在地へのflyToに失敗しました:", error);
      }
    }

    console.log("[GPS Debug] 位置情報の取得を開始します(高精度, timeout 10000ms)");

    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      (error) => {
        if (!mountedRef.current) return;
        console.warn("[GPS Error] 現在地の取得に失敗しました(高精度):", error);
        // 権限拒否の場合は再試行しても無駄なので、その場でユーザーに通知する
        if (error.code === error.PERMISSION_DENIED) {
          setLoading(false);
          setErrorMessage(describeError(error));
          return;
        }
        // タイムアウト・測位不能の場合は標準精度(Wi-Fi/IP測位)で再試行する
        tryStandardAccuracy(flewToCache);
      },
      // enableHighAccuracy: 可能な限りGPSの高精度測位を使う。
      // timeout: 屋外での初回測位(コールドスタート)は5秒では不足しがちなため10秒に緩和。
      // maximumAge: 30秒以内に取得済みの位置情報があればキャッシュを許容し、
      //   タイムアウトの誤発火(=誤ったエラー表示)を抑える。
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
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

// 半径プリセットボタン(1km/5km/10km/30km)。地図の中心座標から指定半径の
// 正方形バウンディングボックス(円が内接するサイズ)を計算し、そこへスムーズに
// ズーム移動する。緯度1度あたり約111kmとして簡易換算しているため、
// 高緯度ほど厳密な精度は落ちるが、プリセットズームの用途としては十分。
const RADIUS_PRESETS_KM = [1, 5, 10, 30] as const;
const KM_PER_DEGREE_LAT = 111;

function computeRadiusBounds(lat: number, lng: number, radiusKm: number): L.LatLngBounds {
  const latDelta = radiusKm / KM_PER_DEGREE_LAT;
  const lngDenominator = KM_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
  const lngDelta = radiusKm / (Math.abs(lngDenominator) > 1e-6 ? lngDenominator : 1);
  return L.latLngBounds(
    [lat - latDelta, lng - Math.abs(lngDelta)],
    [lat + latDelta, lng + Math.abs(lngDelta)]
  );
}

// プリセットボタンによるflyToBoundsのアニメーション時間(秒)。
// 手動ズーム判定の許容ウィンドウ算出にも使う。
const RADIUS_FLY_DURATION_SEC = 1;

function RadiusPresetControl() {
  const map = useMap();
  const [activeRadiusKm, setActiveRadiusKm] = useState<number | null>(null);
  // プリセットボタン押下によるプログラム的なズーム移動(flyToBounds)は、
  // アニメーション中に'zoomstart'が複数回発火することがあるため、
  // 一回限りのフラグで「無視すべき1回」を消費する方式だと、2回目以降の
  // zoomstartを誤って「手動ズーム」と判定してしまう。そのため、押下時刻を
  // 記録しておき、アニメーション想定時間内に発生したzoomstartは
  // すべてプログラム起因とみなして無視する時間窓方式にする。
  const programmaticZoomUntilRef = useRef(0);

  useMapEvents({
    zoomstart() {
      if (Date.now() < programmaticZoomUntilRef.current) {
        return;
      }
      // ホイール/ピンチ/ダブルクリック/ズームボタン等、ユーザーによる
      // 手動ズーム操作とみなし、プリセットのアクティブ表示を解除する
      setActiveRadiusKm(null);
    },
  });

  function handleSelect(radiusKm: number) {
    if (!isMapReady(map)) return;
    const center = map.getCenter();
    const bounds = computeRadiusBounds(center.lat, center.lng, radiusKm);
    // アニメーション時間+余裕(500ms)の間に発生するzoomstartは
    // すべて今回のflyToBoundsに起因するものとして無視する
    programmaticZoomUntilRef.current = Date.now() + RADIUS_FLY_DURATION_SEC * 1000 + 500;
    map.flyToBounds(bounds, { animate: true, duration: RADIUS_FLY_DURATION_SEC });
    setActiveRadiusKm(radiusKm);
  }

  return (
    <div className="absolute top-1.5 sm:top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-0.5 sm:gap-1 bg-white rounded-full shadow-lg border border-gray-200 p-0.5 sm:p-1 pointer-events-auto">
      {RADIUS_PRESETS_KM.map((km) => (
        <button
          key={km}
          type="button"
          onClick={() => handleSelect(km)}
          aria-pressed={activeRadiusKm === km}
          title={`地図の中心から半径${km}kmが収まるズームへ移動`}
          className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-semibold whitespace-nowrap transition-colors ${
            activeRadiusKm === km
              ? "bg-blue-600 text-white"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          {km}km
        </button>
      ))}
    </div>
  );
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
  lastKnownLocation = null,
  crewMembers = [],
  onLocated,
  showPins = true,
  showLegend = true,
  dispatchListOpen,
  myProfile = null,
  myStatus = "待機中",
  selfLocationHistory = [],
}: Props) {
  const [showHazardMap, setShowHazardMap] = useState(false);
  const [showRainRadar, setShowRainRadar] = useState(false);
  const [showWeatherWarnings, setShowWeatherWarnings] = useState(false);

  // 「経路を見る」で選択中のクルーID。nullの間は経路非表示。SELF_ROUTE_IDの場合は
  // 自分自身の移動経路(呼び出し側で実機watchPositionから蓄積・距離フィルタリング・
  // localStorage/Firestoreへ永続化済みのselfLocationHistory)を表示する。
  const [activeRouteCrewId, setActiveRouteCrewId] = useState<string | null>(null);
  const activeRouteCrew = crewMembers.find((c) => c.id === activeRouteCrewId) ?? null;

  const selfPath = selfLocationHistory.filter(([lat, lng]) => isValidCoordinate(lat, lng));

  const activeRouteHistory =
    activeRouteCrewId === SELF_ROUTE_ID
      ? selfPath.length > 1
        ? { path: selfPath, stayPoints: [] as StayPoint[] }
        : null
      : activeRouteCrew?.locationHistory ?? null;

  // 雨雲レーダーのタイムライン(過去〜最新〜未来予測)。選択中フレームのインデックスは
  // 初回ロード時に「最新の実測フレーム」で初期化し、以後はユーザーのスライダー操作/
  // 再生を優先する(タイムライン再取得のたびに選択位置が飛ばないようクランプのみ行う)。
  const { host: rainRadarHost, frames: rainRadarFrames, nowIndex: rainRadarNowIndex } = useRainRadarFrames();
  const [radarFrameIndex, setRadarFrameIndex] = useState<number | null>(null);
  useEffect(() => {
    if (rainRadarFrames.length === 0) return;
    setRadarFrameIndex((prev) => {
      if (prev === null) return rainRadarNowIndex;
      return Math.min(prev, rainRadarFrames.length - 1);
    });
  }, [rainRadarFrames.length, rainRadarNowIndex]);

  return (
    <>
      <MapStyleInjector />

      {/* 気象レイヤー(ハザードマップ/雨雲レーダー/警報注意報)のON/OFFトグル群 - 左上の
          Leaflet標準ズームコントロール(+/-)や右上の凡例ボックスと被らないよう、
          ズームコントロールの下側に縦に並べて独立配置する */}
      <div className="absolute top-20 left-1.5 sm:top-24 sm:left-4 z-[1000] flex flex-col gap-1.5 items-start">
        <HazardMapToggle
          enabled={showHazardMap}
          onToggle={() => setShowHazardMap((v) => !v)}
        />
        <RainRadarToggle
          enabled={showRainRadar}
          onToggle={() => setShowRainRadar((v) => !v)}
        />
        <WeatherWarningToggle
          enabled={showWeatherWarnings}
          onToggle={() => setShowWeatherWarnings((v) => !v)}
        />
      </div>

      {/* クルー移動経路の表示状態インフォメーションバー。
          「表示中」の告知と「非表示」操作を1つのコンパクトなバーに集約し、
          クルーポップアップ側には同じ操作の重複ボタンを置かない(二重表示防止)。
          配置は地図右上(ズームコントロール/半径プリセット/凡例と被らない位置)。
          凡例ボックス(showLegend時に同じ右上へ表示)と重なる場合のみ、その下へ
          ずらして表示する。 */}
      {(activeRouteCrew || activeRouteCrewId === SELF_ROUTE_ID) && (
        <div
          className={`absolute right-1.5 sm:right-4 z-[2000] bg-slate-900/95 text-white rounded-lg shadow-lg pl-2.5 pr-1.5 sm:pl-3 sm:pr-2 py-1.5 flex items-center gap-1.5 sm:gap-2 pointer-events-auto max-w-[calc(100%-0.75rem)] sm:max-w-xs ${
            showLegend ? "top-24 sm:top-32" : "top-1.5 sm:top-4"
          }`}
        >
          <span className="text-[10px] sm:text-xs font-medium whitespace-nowrap truncate min-w-0">
            📍 {activeRouteCrewId === SELF_ROUTE_ID ? "自分" : activeRouteCrew?.name} の経路を表示中
          </span>
          <button
            onClick={() => setActiveRouteCrewId(null)}
            title="経路を非表示にする"
            aria-label="経路を非表示にする"
            className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-[11px] sm:text-xs transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {/* 雨雲レーダーのタイムスライダー・再生コントロール - 地図下部中央に配置 */}
      {showRainRadar && rainRadarFrames.length > 0 && radarFrameIndex !== null && (
        <RainRadarTimeControl
          frames={rainRadarFrames}
          nowIndex={rainRadarNowIndex}
          selectedIndex={radarFrameIndex}
          onSelectIndex={setRadarFrameIndex}
        />
      )}

      {/* 凡例ボックス - 地図右上に配置
          注意: Leaflet内部のレイヤー(タイルペイン z-200、オーバーレイ z-400、
          ポップアップペイン z-700、ズームコントロール等 z-1000)は、この
          凡例divの兄弟要素(.leaflet-containerの子)として同じスタッキング
          コンテキストで競合するため、それらすべてを上回るz-indexが必須。
          (.leaflet-containerはposition:relativeのみでz-indexを持たず、
          新しいスタッキングコンテキストを作らないため) */}
      {showLegend && (
        <div className="absolute top-1.5 right-1.5 sm:top-4 sm:right-4 z-[2000] bg-white rounded sm:rounded-lg shadow-lg border border-gray-200 p-1 sm:p-3 w-auto max-w-none sm:max-w-xs pointer-events-auto">
          <h3 className="text-[8px] sm:text-xs font-bold text-gray-900 mb-0.5 sm:mb-2 leading-tight whitespace-nowrap">駐車・駐停車</h3>
          <div className="space-y-0.5 sm:space-y-1.5">
            <div className="flex items-center gap-0.5 sm:gap-2">
              <div className="w-2 h-1.5 sm:w-4 sm:h-3 rounded-sm sm:rounded flex-shrink-0" style={{ backgroundColor: '#2563eb' }}></div>
              <span className="text-[7px] sm:text-xs text-gray-700 leading-tight whitespace-nowrap">駐車候補（広い道路）</span>
            </div>
            <div className="flex items-center gap-0.5 sm:gap-2">
              <div className="w-2 h-1.5 sm:w-4 sm:h-3 rounded-sm sm:rounded flex-shrink-0" style={{ backgroundColor: '#f59e0b' }}></div>
              <span className="text-[7px] sm:text-xs text-gray-700 leading-tight whitespace-nowrap">駐停車候補（短時間）</span>
            </div>
          </div>
          <p className="text-[7px] sm:text-xs text-gray-500 mt-0.5 sm:mt-2 leading-tight whitespace-nowrap">現地で必ず確認してください</p>
        </div>
      )}

      <MapContainer
        center={center}
        zoom={12}
        scrollWheelZoom={false}
        dragging={true}
        touchZoom={true}
        doubleClickZoom={true}
        zoomControl={true}
        className="h-full w-full pointer-events-auto"
        style={{
          touchAction: "manipulation",
          WebkitTouchCallout: "none",
          maxWidth: "100vw",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
      {/* 地図初期化コンポーネント - invalidateSize() を実行してタイル描画を即座に開始 */}
      <MapInitializer />
      {/* FlyTo コンポーネント - 検索結果などで地図を移動 */}
      <FlyToLocation target={flyTo} />
      {/* 選択ピン自動センタリング - ピン選択時に地図の中心を設定 */}
      <FlyToSelectedPin selectedPin={selectedPin} />
      {/* 詳細パネル開閉時のリサイズ処理 */}
      <PanelResizeHandler showDetailPanel={showDetailPanel} selectedPin={selectedPin} dispatchListOpen={dispatchListOpen} />
      {/* クルー移動経路表示時、経路全体が収まるよう地図の表示範囲を自動調整 */}
      <RouteFitBounds path={activeRouteHistory?.path ?? null} />
      {/* 現在地表示ボタン */}
      <LocateControl onLocated={onLocated} lastKnownLocation={lastKnownLocation} />
      {/* 半径プリセットボタン(1km/5km/10km/30km) - 直感的なズーム操作用 */}
      <RadiusPresetControl />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        keepBuffer={2}
        updateWhenIdle={true}
        updateInterval={200}
      />

      {/* 気象レイヤー群。重なり順を要件通り
          「ベース地図 < 警報・注意報ポリゴン < ハザードマップ < 雨雲レーダー < ピンマーカー」
          にするため、それぞれ専用のPane(zIndex)に配置する。
          (ピンはLeaflet標準のmarkerPane[zIndex:600]のまま最前面に残る。
          ただし警報の具体名テキストラベルのみ、視認性優先でさらに上位の
          専用Pane[warningLabelPane]に別途配置する。下記参照) */}
      <Pane name="warningsPane" style={{ zIndex: 350, pointerEvents: "none" }}>
        {showWeatherWarnings && <WarningPolygonLayer />}
      </Pane>

      {/* ハザードマップ(国土地理院 洪水浸水想定区域)。keepBufferを絞り、
          updateWhenIdle/updateInterval込みで表示中の範囲周辺のみ描画することで、
          現場ピンが多い場合でもタイル読み込み負荷を抑える */}
      <Pane name="hazardPane" style={{ zIndex: 450, pointerEvents: "none" }}>
        {showHazardMap && <HazardMapTileLayer />}
      </Pane>

      {/* 雨雲レーダー(RainViewer) - タイムスライダーで選択中のフレームを表示 */}
      <Pane name="rainRadarPane" style={{ zIndex: 550, pointerEvents: "none" }}>
        {showRainRadar && rainRadarHost && radarFrameIndex !== null && rainRadarFrames[radarFrameIndex] && (
          <>
            <RainRadarTileLayer host={rainRadarHost} frame={rainRadarFrames[radarFrameIndex]} />
            <RainRadarPreloader host={rainRadarHost} frames={rainRadarFrames} selectedIndex={radarFrameIndex} />
          </>
        )}
      </Pane>

      {/* 警報・注意報の具体名テキストラベル - ハザードマップ/雨雲レーダーのタイルに
          隠れないよう、標準markerPane(z:600)よりさらに上位の専用Paneに配置する
          (ポリゴン塗り自体はwarningsPaneのまま。ラベルのみ視認性を優先して最前面へ)。
          要約表示クリック時のポップアップ操作を受け付けるため pointerEvents は auto */}
      <Pane name="warningLabelPane" style={{ zIndex: 620, pointerEvents: "auto" }}>
        {showWeatherWarnings && <WarningLabelLayer />}
      </Pane>

      {showPins && pins
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

      {userLocation && isValidCoordinate(userLocation.lat, userLocation.lng) && (() => {
        const { main: myStatusColor } = CREW_STATUS_COLOR[myStatus] ?? CREW_STATUS_COLOR["待機中"];
        return (
          <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={userLocationIcon}
          >
            <Popup>
              <div className="space-y-2 w-52">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-gray-900">
                    (自分) {myProfile?.name ?? "未設定"}
                    {myProfile?.category ? ` / ${myProfile.category}` : ""}
                  </p>
                  <span
                    className="text-[10px] font-semibold text-white rounded px-1.5 py-0.5 whitespace-nowrap"
                    style={{ backgroundColor: myStatusColor }}
                  >
                    {myStatus}
                  </span>
                </div>
                {/* 電話番号リンク: crewポップアップと同様、Leafletのデフォルトの
                    リンク色(青)がTailwindクラスより詳細度で勝ってしまうため、
                    style属性で明示的に黒文字(#1a1a1a)を指定して確実に上書きする。 */}
                {myProfile?.phone ? (
                  <a
                    href={`tel:${myProfile.phone}`}
                    style={{ color: "#1a1a1a" }}
                    className="block text-center text-sm bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded px-2 py-1.5 transition-colors font-semibold"
                  >
                    📞 {myProfile.phone}
                  </a>
                ) : (
                  <p className="text-center text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded px-2 py-1.5">
                    連絡先未登録
                  </p>
                )}
                {selfPath.length > 1 ? (
                  activeRouteCrewId === SELF_ROUTE_ID ? (
                    <p className="text-center text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1.5 font-medium">
                      📍 経路表示中(右上のバーから閉じられます)
                    </p>
                  ) : (
                    <button
                      onClick={() => setActiveRouteCrewId(SELF_ROUTE_ID)}
                      className="block w-full text-center text-sm bg-orange-100 text-orange-800 hover:bg-orange-200 rounded px-2 py-1.5 transition-colors font-medium"
                    >
                      📍 自分の移動経路を見る
                    </button>
                  )
                ) : (
                  <p className="text-center text-xs text-gray-400">
                    移動経路を記録中です
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })()}

      {/* 報道クルー/スタッフの位置ピン(ダミーデータ)。ステータスに応じて色分けし、
          クリック時にPopupで詳細(氏名・職種・ステータス・車両・連絡先等)を表示する。 */}
      {crewMembers
        .filter((crew) => isValidCoordinate(crew.position[0], crew.position[1]))
        .map((crew) => {
          const { main } = CREW_STATUS_COLOR[crew.status] ?? CREW_STATUS_COLOR["待機中"];
          return (
            <Marker
              key={crew.id}
              position={[crew.position[0], crew.position[1]]}
              icon={getCrewIcon(crew.status)}
            >
              <Popup>
                <div className="space-y-2 w-52">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-gray-900">{crew.name}</p>
                    <span
                      className="text-[10px] font-semibold text-white rounded px-1.5 py-0.5 whitespace-nowrap"
                      style={{ backgroundColor: main }}
                    >
                      {crew.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{crew.role}</p>
                  <div className="text-xs text-gray-500 space-y-0.5">
                    <p>🚐 {crew.vehicle}</p>
                    <p>🕒 最終更新: {crew.updatedAt}</p>
                  </div>
                  {/* 電話番号リンク: Leafletのデフォルトスタイル(.leaflet-container a{color:#0078A8})が
                      Tailwindのtext-*クラスより詳細度で勝ってしまい、指定した文字色が
                      無視され視認できなくなる問題があったため、style属性で明示的に
                      黒文字(#1a1a1a)を指定して確実に上書きする。背景も薄い色に変更し
                      黒文字とのコントラストを確保している。 */}
                  <a
                    href={`tel:${crew.phone}`}
                    style={{ color: "#1a1a1a" }}
                    className="block text-center text-sm bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded px-2 py-1.5 transition-colors font-semibold"
                  >
                    📞 {crew.phone}
                  </a>
                  {crew.locationHistory && crew.locationHistory.path.length > 0 && (
                    activeRouteCrewId === crew.id ? (
                      // 非表示操作は地図右上のインフォメーションバーに集約しているため、
                      // ここには重複するボタンを置かず、状態を示すラベルのみ表示する。
                      <p className="text-center text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1.5 font-medium">
                        📍 経路表示中(右上のバーから閉じられます)
                      </p>
                    ) : (
                      <button
                        onClick={() => setActiveRouteCrewId(crew.id)}
                        className="block w-full text-center text-sm bg-orange-100 text-orange-800 hover:bg-orange-200 rounded px-2 py-1.5 transition-colors font-medium"
                      >
                        📍 経路を見る
                      </button>
                    )
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

      {/* クルー移動経路(選択中のクルーのみ) - 目立つオレンジの破線で描画 */}
      {/* 移動経路のライン: 自分の経路(実機GPS)は青、他クルーの経路はオレンジの破線で区別する */}
      {activeRouteHistory && activeRouteHistory.path.filter(([lat, lng]) => isValidCoordinate(lat, lng)).length > 1 && (
        <Polyline
          positions={activeRouteHistory.path.filter(([lat, lng]) => isValidCoordinate(lat, lng))}
          pathOptions={
            activeRouteCrewId === SELF_ROUTE_ID
              ? { color: "#2563eb", weight: 5, opacity: 0.9 }
              : { color: "#ea580c", weight: 5, opacity: 0.9, dashArray: "10 8" }
          }
        />
      )}

      {/* クルー移動経路の滞在ポイント */}
      {activeRouteHistory &&
        activeRouteHistory.stayPoints
          .filter((sp) => isValidCoordinate(sp.lat, sp.lng))
          .map((sp, idx) => (
            <Marker key={`stay-${activeRouteCrewId}-${idx}`} position={[sp.lat, sp.lng]} icon={stayPointIcon}>
              <Popup>
                <div className="space-y-1 w-48">
                  <p className="font-bold text-gray-900">{sp.name}</p>
                  <p className="text-sm text-gray-700">
                    {sp.arrivedAt}〜{sp.departedAt}
                  </p>
                  <p className="text-xs text-gray-500">{sp.duration}滞在</p>
                </div>
              </Popup>
            </Marker>
          ))}

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
                  style={{ color: "#ffffff" }}
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
                  style={{ color: "#ffffff" }}
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
