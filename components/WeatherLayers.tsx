"use client";

import { useEffect, useRef, useState } from "react";
import { Marker, Polygon, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

// ============================================================
// 雨雲レーダー (RainViewer API) - タイムライン・アニメーション対応
// ============================================================

const RAINVIEWER_INDEX_URL = "https://api.rainviewer.com/public/weather-maps.json";
// RainViewerのレーダーは約10分おきに更新されるため、それに合わせて定期的にタイムラインを再取得する
const RAINVIEWER_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const RAINVIEWER_MAX_NATIVE_ZOOM = 7; // レーダータイルの実在ズーム上限(これ以上は"Zoom Level Not Supported")

export type RadarFrame = { path: string; time: number; isForecast: boolean };

// RainViewer APIから過去(past)〜未来予測(nowcast)までの全タイムスタンプを取得するフック。
// frames配列は時系列順(過去→最新→未来予測)、nowIndexは「最新の実測フレーム」の
// インデックス(=過去/未来予測の境目)を表す。
export function useRainRadarFrames() {
  const [host, setHost] = useState<string | null>(null);
  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [nowIndex, setNowIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(RAINVIEWER_INDEX_URL);
        if (!res.ok) throw new Error(`RainViewer API error: ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const past = Array.isArray(data?.radar?.past) ? data.radar.past : [];
        const nowcast = Array.isArray(data?.radar?.nowcast) ? data.radar.nowcast : [];
        if (!data?.host || past.length === 0) return;

        const nextFrames: RadarFrame[] = [
          ...past.map((f: any) => ({ path: f.path, time: f.time, isForecast: false })),
          ...nowcast.map((f: any) => ({ path: f.path, time: f.time, isForecast: true })),
        ];
        setHost(data.host);
        setFrames(nextFrames);
        setNowIndex(past.length - 1); // pastの末尾が「最新の実測」フレーム
      } catch (error) {
        console.warn("[RainViewer] タイムラインの取得に失敗しました:", error);
      }
    }

    load();
    const interval = setInterval(load, RAINVIEWER_REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { host, frames, nowIndex };
}

// 現在表示中のタイル範囲(z/x/y)を計算し、指定フレームの画像をブラウザキャッシュへ
// 先読みしておくヘルパー。スライダー操作時のチラつきを抑えるための軽量プリロード。
// (対象を「現在の表示範囲」×「1タイルあたり最大16枚」に絞ることで、
//  全フレーム×広範囲を無条件にプリロードして帯域を圧迫することを防ぐ)
function preloadFrameTiles(map: L.Map, host: string, frame: RadarFrame | undefined) {
  if (!frame) return;
  try {
    const zoom = Math.min(Math.floor(map.getZoom()), RAINVIEWER_MAX_NATIVE_ZOOM);
    const bounds = map.getBounds();
    const topLeft = map.project(bounds.getNorthWest(), zoom).divideBy(256).floor();
    const bottomRight = map.project(bounds.getSouthEast(), zoom).divideBy(256).floor();

    const xs: number[] = [];
    for (let x = topLeft.x; x <= bottomRight.x && xs.length < 4; x++) xs.push(x);
    const ys: number[] = [];
    for (let y = topLeft.y; y <= bottomRight.y && ys.length < 4; y++) ys.push(y);

    for (const x of xs) {
      for (const y of ys) {
        const img = new Image();
        img.src = `${host}${frame.path}/256/${zoom}/${x}/${y}/2/1_1.png`;
      }
    }
  } catch (error) {
    // プリロードはベストエフォートのため、失敗しても致命的ではない(無視して続行)
    console.warn("[RainViewer] タイルのプリロードに失敗しました:", error);
  }
}

// 選択中フレームの前後1フレームを先読みするコンポーネント(MapContainer内で使用)
export function RainRadarPreloader({
  host,
  frames,
  selectedIndex,
}: {
  host: string | null;
  frames: RadarFrame[];
  selectedIndex: number | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!host || selectedIndex === null || frames.length === 0) return;
    preloadFrameTiles(map, host, frames[selectedIndex - 1]);
    preloadFrameTiles(map, host, frames[selectedIndex + 1]);
  }, [host, frames, selectedIndex, map]);

  return null;
}

// 雨雲レーダーのタイルレイヤー。選択中フレーム(host+path)を親から受け取って表示する
// (親側でタイムライン管理・スライダー操作を行うため、内部での自動フェッチは行わない)。
export function RainRadarTileLayer({
  host,
  frame,
}: {
  host: string;
  frame: RadarFrame;
}) {
  return (
    <TileLayer
      key={frame.path}
      url={`${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`}
      opacity={0.6}
      maxNativeZoom={RAINVIEWER_MAX_NATIVE_ZOOM}
      attribution='<a href="https://www.rainviewer.com/">RainViewer</a>'
    />
  );
}

// フレームのUNIXタイムスタンプ(秒)を「HH:MM(n分前/最新/n分後・予測)」形式に整形する
function formatFrameLabel(frame: RadarFrame, nowFrameTime: number): string {
  const date = new Date(frame.time * 1000);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const diffMin = Math.round((frame.time - nowFrameTime) / 60);

  let relative: string;
  if (diffMin === 0) {
    relative = "最新";
  } else if (diffMin > 0) {
    relative = `${diffMin}分後・予測`;
  } else {
    relative = `${Math.abs(diffMin)}分前`;
  }
  return `${hh}:${mm}（${relative}）`;
}

// 雨雲レーダーのタイムスライダー・再生コントロール。地図下部に配置する。
export function RainRadarTimeControl({
  frames,
  nowIndex,
  selectedIndex,
  onSelectIndex,
  className = "",
}: {
  frames: RadarFrame[];
  nowIndex: number;
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing || frames.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    // フレームを700ms間隔で自動送りし、末尾まで来たら先頭へループする
    intervalRef.current = setInterval(() => {
      onSelectIndex((selectedIndex + 1) % frames.length);
    }, 700);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, frames.length, selectedIndex]);

  if (frames.length === 0) return null;

  const currentFrame = frames[selectedIndex];
  const nowFrameTime = frames[nowIndex]?.time ?? currentFrame.time;
  const label = formatFrameLabel(currentFrame, nowFrameTime);

  return (
    <div
      className={`absolute left-1.5 right-1.5 bottom-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:bottom-4 sm:w-[420px] z-[1000] bg-white/95 backdrop-blur rounded-lg sm:rounded-xl shadow-lg border border-gray-200 px-2.5 sm:px-3 py-2 pointer-events-auto ${className}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPlaying((v) => !v)}
          aria-label={playing ? "雨雲アニメーションを一時停止" : "雨雲アニメーションを再生"}
          className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-sky-600 text-white flex items-center justify-center hover:bg-sky-700 active:scale-95 transition-transform"
        >
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="1" y="1" width="3" height="10" /><rect x="8" y="1" width="3" height="10" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M1 0.5v11l10-5.5z" /></svg>
          )}
        </button>

        <input
          type="range"
          min={0}
          max={frames.length - 1}
          step={1}
          value={selectedIndex}
          onChange={(e) => {
            setPlaying(false);
            onSelectIndex(Number(e.target.value));
          }}
          className="flex-1 accent-sky-600 h-1.5 cursor-pointer"
          aria-label="雨雲レーダーの時間"
        />

        <span className="flex-shrink-0 text-[10px] sm:text-xs font-semibold text-gray-700 whitespace-nowrap tabular-nums">
          {label}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// 気象警報・注意報 (気象庁 防災情報JSON) - ポリゴン塗り + テキストラベル
// ============================================================

type WarningSeverity = "special" | "warning" | "advisory";

// ポリゴン塗りつぶし色(要件通り: 特別警報=紫/警報=赤/注意報=黄)
const WARNING_SEVERITY_FILL: Record<WarningSeverity, { fillColor: string; fillOpacity: number }> = {
  special: { fillColor: "#aa00aa", fillOpacity: 0.4 },
  warning: { fillColor: "#ff0000", fillOpacity: 0.35 },
  advisory: { fillColor: "#ffff00", fillOpacity: 0.3 },
};

// テキストラベルの配色(注意報のみ黒文字、それ以外は白文字でくっきり表示)
const WARNING_LABEL_STYLE: Record<WarningSeverity, { bg: string; text: string; border: string }> = {
  special: { bg: "#aa00aa", text: "#ffffff", border: "#6a006a" },
  warning: { bg: "#ff0000", text: "#ffffff", border: "#b30000" },
  advisory: { bg: "#ffff00", text: "#1a1a00", border: "#c8c800" },
};

// 気象庁の警報コード(2桁)→ 名称・ティアの対応表。
// 気象庁防災情報JSON APIの実データ(例: 14=雷注意報, 15=強風注意報, 16=波浪注意報,
// 20=濃霧注意報)と突き合わせて検証済み。ただし気象庁の全コード体系を厳密に
// 網羅した一次情報ではなく、主要な警報種別を対象とした簡易実装である点に留意。
const WARNING_CODE_INFO: Record<number, { name: string; severity: WarningSeverity }> = {
  2: { name: "暴風雪警報", severity: "warning" },
  3: { name: "大雨警報", severity: "warning" },
  4: { name: "洪水警報", severity: "warning" },
  5: { name: "暴風警報", severity: "warning" },
  6: { name: "大雪警報", severity: "warning" },
  7: { name: "波浪警報", severity: "warning" },
  8: { name: "高潮警報", severity: "warning" },
  10: { name: "大雨注意報", severity: "advisory" },
  12: { name: "大雪注意報", severity: "advisory" },
  13: { name: "風雪注意報", severity: "advisory" },
  14: { name: "雷注意報", severity: "advisory" },
  15: { name: "強風注意報", severity: "advisory" },
  16: { name: "波浪注意報", severity: "advisory" },
  17: { name: "融雪注意報", severity: "advisory" },
  18: { name: "洪水注意報", severity: "advisory" },
  19: { name: "高潮注意報", severity: "advisory" },
  20: { name: "濃霧注意報", severity: "advisory" },
  21: { name: "乾燥注意報", severity: "advisory" },
  22: { name: "なだれ注意報", severity: "advisory" },
  23: { name: "低温注意報", severity: "advisory" },
  24: { name: "霜注意報", severity: "advisory" },
  25: { name: "着氷注意報", severity: "advisory" },
  26: { name: "着雪注意報", severity: "advisory" },
  32: { name: "暴風雪特別警報", severity: "special" },
  33: { name: "大雨特別警報", severity: "special" },
  35: { name: "暴風特別警報", severity: "special" },
  36: { name: "大雪特別警報", severity: "special" },
  37: { name: "波浪特別警報", severity: "special" },
  38: { name: "高潮特別警報", severity: "special" },
};

function classifyWarningCode(code: string): { name: string; severity: WarningSeverity } | null {
  return WARNING_CODE_INFO[Number(code)] ?? null;
}

const SEVERITY_RANK: Record<WarningSeverity, number> = { advisory: 1, warning: 2, special: 3 };

// 表示対象の都県(簡易実装のため放送クルーの主な活動エリアである関東主要4都県に限定)。
// polygonは行政区域の正確な形状ではなく、可視化用に簡略化した概形の矩形(簡易GeoJSON代替)。
const WARNING_REGIONS: {
  name: string;
  jmaAreaCode: string; // 気象庁 防災情報JSONのエリアコード
  polygon: [number, number][]; // [lat, lng] の概形ポリゴン
}[] = [
  {
    name: "東京都",
    jmaAreaCode: "130000",
    polygon: [
      [35.9, 138.95],
      [35.9, 139.95],
      [35.5, 139.95],
      [35.5, 138.95],
    ],
  },
  {
    name: "神奈川県",
    jmaAreaCode: "140000",
    polygon: [
      [35.65, 138.9],
      [35.65, 139.8],
      [35.1, 139.8],
      [35.1, 138.9],
    ],
  },
  {
    name: "埼玉県",
    jmaAreaCode: "110000",
    polygon: [
      [36.3, 138.7],
      [36.3, 139.95],
      [35.75, 139.95],
      [35.75, 138.7],
    ],
  },
  {
    name: "千葉県",
    jmaAreaCode: "120000",
    polygon: [
      [35.85, 139.7],
      [35.85, 140.95],
      [34.9, 140.95],
      [34.9, 139.7],
    ],
  },
];

// 単純多角形(頂点の単純平均)による代表座標の算出。行政区域の正確な重心ではないが、
// ラベル配置用の近似座標としては十分。
function polygonCentroid(polygon: [number, number][]): [number, number] {
  const [latSum, lngSum] = polygon.reduce(
    ([lat, lng], [pLat, pLng]) => [lat + pLat, lng + pLng],
    [0, 0]
  );
  return [latSum / polygon.length, lngSum / polygon.length];
}

const WARNING_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type AreaWarningResult = { severity: WarningSeverity; names: string[] } | null;

// 指定した気象庁エリアコードの防災情報JSONを取得し、発表中(発表/継続)の
// 警報・注意報の名称一覧と、そのうち最も深刻なティアを返す。
async function fetchAreaWarnings(jmaAreaCode: string): Promise<AreaWarningResult> {
  const res = await fetch(`https://www.jma.go.jp/bosai/warning/data/warning/${jmaAreaCode}.json`);
  if (!res.ok) throw new Error(`JMA API error: ${res.status}`);
  const data = await res.json();

  let maxSeverity: WarningSeverity | null = null;
  const names = new Set<string>();

  for (const areaType of data?.areaTypes ?? []) {
    for (const area of areaType?.areas ?? []) {
      for (const w of area?.warnings ?? []) {
        // "発表"(新規発表)・"継続"(発表中)のみを有効な警報として扱う
        // ("解除"や空文字ステータスは非表示対象)
        if (w?.status !== "発表" && w?.status !== "継続") continue;
        const info = classifyWarningCode(w?.code);
        if (!info) continue;
        names.add(info.name);
        if (!maxSeverity || SEVERITY_RANK[info.severity] > SEVERITY_RANK[maxSeverity]) {
          maxSeverity = info.severity;
        }
      }
    }
  }

  if (!maxSeverity) return null;
  return { severity: maxSeverity, names: Array.from(names) };
}

// 警報ラベル用divIconをキャッシュしつつ生成する(同一内容の再生成を避けるため)
const warningLabelIconCache = new globalThis.Map<string, L.DivIcon>();

function getWarningLabelIcon(names: string[], severity: WarningSeverity, compact: boolean): L.DivIcon {
  const cacheKey = `${severity}:${compact ? "s" : "l"}:${names.join(",")}`;
  const cached = warningLabelIconCache.get(cacheKey);
  if (cached) return cached;

  const style = WARNING_LABEL_STYLE[severity];
  const text = names.join(" / ");
  const fontSize = compact ? 10 : 13;
  const padding = compact ? "2px 6px" : "4px 10px";

  const icon = L.divIcon({
    className: "",
    html: `<div style="
      position: relative;
      left: -50%;
      top: -50%;
      background: ${style.bg};
      color: ${style.text};
      font-weight: 700;
      font-size: ${fontSize}px;
      line-height: 1.3;
      padding: ${padding};
      border-radius: 6px;
      border: 1px solid ${style.border};
      box-shadow: 0 1px 4px rgba(0,0,0,0.35);
      white-space: nowrap;
      pointer-events: none;
    ">${text.replace(/</g, "&lt;")}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
  warningLabelIconCache.set(cacheKey, icon);
  return icon;
}

// 都県ごとの気象庁警報データを取得・定期更新する共有フック。
// ポリゴン塗り(WarningPolygonLayer)とテキストラベル(WarningLabelLayer)の
// 両方から参照される(ラベルは重なり順の都合でハザードマップ/雨雲レーダーより
// 上位の別Paneに描画する必要があるため、取得ロジックを1箇所にまとめて共有する)。
function useWarningResults() {
  const [results, setResults] = useState<Record<string, AreaWarningResult>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const fetched = await Promise.allSettled(
        WARNING_REGIONS.map((region) => fetchAreaWarnings(region.jmaAreaCode))
      );
      if (cancelled) return;
      const next: Record<string, AreaWarningResult> = {};
      fetched.forEach((result, i) => {
        if (result.status === "fulfilled") {
          next[WARNING_REGIONS[i].jmaAreaCode] = result.value;
        } else {
          console.warn(
            `[JMA] ${WARNING_REGIONS[i].name}の警報情報取得に失敗しました:`,
            result.reason
          );
          next[WARNING_REGIONS[i].jmaAreaCode] = null;
        }
      });
      setResults(next);
    }

    load();
    const interval = setInterval(load, WARNING_REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return results;
}

// 警報・注意報の半透明塗りつぶしポリゴン。
export function WarningPolygonLayer() {
  const results = useWarningResults();

  return (
    <>
      {WARNING_REGIONS.map((region) => {
        const result = results[region.jmaAreaCode];
        if (!result) return null;
        const fillStyle = WARNING_SEVERITY_FILL[result.severity];
        return (
          <Polygon
            key={region.jmaAreaCode}
            positions={region.polygon}
            interactive={false}
            pathOptions={{
              fillColor: fillStyle.fillColor,
              fillOpacity: fillStyle.fillOpacity,
              color: "transparent",
              weight: 0,
            }}
          />
        );
      })}
    </>
  );
}

// 警報・注意報の具体名テキストラベル(「大雨警報 / 洪水注意報」等)。
// ハザードマップ/雨雲レーダーのタイルより確実に前面へ出す必要があるため、
// ポリゴン塗り(WarningPolygonLayer)とは別の高いzIndexのPaneで描画する想定
// (呼び出し側でPane配置を行う)。
export function WarningLabelLayer() {
  const results = useWarningResults();
  const [zoom, setZoom] = useState(12);

  useMapEvents({
    zoomend(e) {
      setZoom(e.target.getZoom());
    },
  });

  // ズームレベルが引かれた(広域)状態ほどラベルの相対的な視認性が下がるため、
  // 一定より広域(zoom<=9)ではフォント/パディングを大きめにして見やすくする
  const compact = zoom > 9;

  return (
    <>
      {WARNING_REGIONS.map((region) => {
        const result = results[region.jmaAreaCode];
        if (!result) return null;
        const centroid = polygonCentroid(region.polygon);
        return (
          <Marker
            key={region.jmaAreaCode}
            position={centroid}
            icon={getWarningLabelIcon(result.names, result.severity, compact)}
            interactive={false}
            keyboard={false}
          />
        );
      })}
    </>
  );
}

// ============================================================
// トグルボタン (ハザードマップボタンと同系統のデザイン)
// ============================================================

export function RainRadarToggle({
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
      title="雨雲レーダーの表示切替"
      className={`flex items-center gap-1.5 rounded-full shadow-lg border px-3 py-2 text-[11px] font-semibold transition-colors pointer-events-auto whitespace-nowrap ${
        enabled
          ? "bg-sky-600 border-sky-600 text-white"
          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
      } ${className}`}
    >
      🌧️ 雨雲レーダー{enabled ? "ON" : "OFF"}
    </button>
  );
}

export function WeatherWarningToggle({
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
      title="気象警報・注意報の表示切替"
      className={`flex items-center gap-1.5 rounded-full shadow-lg border px-3 py-2 text-[11px] font-semibold transition-colors pointer-events-auto whitespace-nowrap ${
        enabled
          ? "bg-red-600 border-red-600 text-white"
          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
      } ${className}`}
    >
      ⚠️ 警報・注意報{enabled ? "ON" : "OFF"}
    </button>
  );
}
