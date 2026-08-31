"use client";

import { TileLayer } from "react-leaflet";

// 国土地理院 ハザードマップポータルサイトの洪水浸水想定区域タイル。
// 複数の地図コンポーネント(LiveDispatchMap / DispatchTrackMap / Map)で
// 同じURL・opacity・attributionを使い回すための共通定義。
export const HAZARD_MAP_TILE_URL =
  "https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png";
export const HAZARD_MAP_ATTRIBUTION =
  '<a href="https://disaportal.gsi.go.jp/">ハザードマップポータルサイト</a>(国土地理院)';

// ハザードマップ(洪水浸水想定区域)のオーバーレイタイルレイヤー。
// 下地の標準地図・ピン・軌跡が透けて見えるようopacityを0.6に抑える。
// zIndexはLeafletの標準ペイン構成(tilePane)内での重ね順を明示するためのもの。
// keepBuffer/updateWhenIdle/updateIntervalは、現場ピンが多い画面(トップページ等)で
// 表示範囲外のタイルまで先読みし続けてパフォーマンスが落ちるのを防ぐためのデフォルト値。
export function HazardMapTileLayer({
  keepBuffer = 2,
  updateWhenIdle = true,
  updateInterval = 200,
}: {
  keepBuffer?: number;
  updateWhenIdle?: boolean;
  updateInterval?: number;
} = {}) {
  return (
    <TileLayer
      attribution={HAZARD_MAP_ATTRIBUTION}
      url={HAZARD_MAP_TILE_URL}
      opacity={0.6}
      zIndex={10}
      keepBuffer={keepBuffer}
      updateWhenIdle={updateWhenIdle}
      updateInterval={updateInterval}
    />
  );
}

// ハザードマップON/OFF切替ボタン。デザインを各画面で統一するための共通コンポーネント。
// 呼び出し側で絶対配置(位置)を制御できるよう、位置指定用のclassNameを外から渡す。
export function HazardMapToggle({
  enabled,
  onToggle,
  className = "",
}: {
  enabled: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={enabled}
      title="ハザードマップ(洪水浸水想定区域)の表示切替"
      className={`flex items-center gap-1.5 rounded-full shadow-lg border px-3 py-2 text-[11px] font-semibold transition-colors pointer-events-auto whitespace-nowrap ${
        enabled
          ? "bg-amber-600 border-amber-600 text-white"
          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
      } ${className}`}
    >
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${enabled ? "bg-white animate-pulse" : "bg-gray-400"}`}
      />
      ハザードマップ{enabled ? "ON" : "OFF"}
    </button>
  );
}
