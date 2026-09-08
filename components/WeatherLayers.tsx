"use client";

import { useEffect, useState } from "react";
import { Polygon, TileLayer } from "react-leaflet";

// ============================================================
// 雨雲レーダー (RainViewer API)
// ============================================================

const RAINVIEWER_INDEX_URL = "https://api.rainviewer.com/public/weather-maps.json";
// RainViewerのレーダーは約10分おきに更新されるため、それに合わせて定期的にタイムスタンプを再取得する
const RAINVIEWER_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type RadarFrame = { host: string; path: string; time: number };

// RainViewer APIから最新の過去レーダーフレームを取得する。
// 注意: v2 APIのフレームは「time(UNIXタイムスタンプ)」と「path(不透明なハッシュ文字列。
// タイルURLの構築には必ずこちらを使う必要があり、timeをそのままパスに使うと
// "Zoom Level Not Supported" 画像が返ってくる)」を別々に持つため、両方を保持する。
async function fetchLatestRadarFrame(): Promise<RadarFrame | null> {
  const res = await fetch(RAINVIEWER_INDEX_URL);
  if (!res.ok) throw new Error(`RainViewer API error: ${res.status}`);
  const data = await res.json();
  const pastFrames = data?.radar?.past;
  if (!Array.isArray(pastFrames) || pastFrames.length === 0) return null;
  const host = data?.host;
  if (!host) return null;
  // 配列末尾が最新フレーム
  const latest = pastFrames[pastFrames.length - 1];
  if (!latest?.path) return null;
  return { host, path: latest.path, time: latest.time };
}

// 雨雲レーダーのタイルレイヤー。マウント時に最新フレームを取得し、
// 以後は定期的に再取得して表示を最新に保つ。取得できるまでは何も描画しない。
export function RainRadarTileLayer() {
  const [frame, setFrame] = useState<RadarFrame | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const latest = await fetchLatestRadarFrame();
        if (!cancelled && latest !== null) {
          setFrame(latest);
        }
      } catch (error) {
        console.warn("[RainViewer] レーダーフレームの取得に失敗しました:", error);
      }
    }

    load();
    const interval = setInterval(load, RAINVIEWER_REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (frame === null) return null;

  return (
    <TileLayer
      key={frame.path}
      url={`${frame.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`}
      opacity={0.6}
      // RainViewerのレーダータイルはズームレベル7までしか存在せず、それ以上は
      // "Zoom Level Not Supported" のプレースホルダー画像が返ってくる。
      // maxNativeZoomで実際のタイル取得上限を7に固定し、それ以上のズームでは
      // Leafletが自動的にz7のタイルを拡大表示する(ズームレベル自体はmaxZoomまで可能)。
      maxNativeZoom={7}
      attribution='<a href="https://www.rainviewer.com/">RainViewer</a>'
    />
  );
}

// ============================================================
// 気象警報・注意報 (気象庁 防災情報JSON)
// ============================================================

type WarningSeverity = "special" | "warning" | "advisory";

// ステータスカラー(要件通り: 特別警報=紫/警報=赤/注意報=黄)
const WARNING_SEVERITY_STYLE: Record<WarningSeverity, { fillColor: string; fillOpacity: number }> = {
  special: { fillColor: "#aa00aa", fillOpacity: 0.4 },
  warning: { fillColor: "#ff0000", fillOpacity: 0.35 },
  advisory: { fillColor: "#ffff00", fillOpacity: 0.3 },
};

// 気象庁の警報コード(2桁)から特別警報/警報/注意報のティアを判定するマッピング。
// 気象庁防災情報JSON APIの実データ(例: 14=雷注意報, 15=強風注意報, 16=波浪注意報,
// 20=濃霧注意報)と突き合わせて検証済み。ただし気象庁の全コード体系を厳密に
// 網羅した一次情報ではなく、主要な警報種別を対象とした簡易実装である点に留意。
const SPECIAL_WARNING_CODES = new Set([32, 33, 35, 36, 37, 38]); // 各種特別警報
const WARNING_CODES = new Set([2, 3, 4, 5, 6, 7, 8]); // 各種警報
const ADVISORY_CODES = new Set([10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]); // 各種注意報

function classifyWarningCode(code: string): WarningSeverity | null {
  const n = Number(code);
  if (SPECIAL_WARNING_CODES.has(n)) return "special";
  if (WARNING_CODES.has(n)) return "warning";
  if (ADVISORY_CODES.has(n)) return "advisory";
  return null;
}

const SEVERITY_RANK: Record<WarningSeverity, number> = { advisory: 1, warning: 2, special: 3 };

// 表示対象の都県(簡易実装のため放送クルーの主な活動エリアである関東主要4都県に限定)。
// polygonは行政区域の正確な形状ではなく、可視化用に簡略化した概形の矩形/多角形(簡易GeoJSON代替)。
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

const WARNING_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// 指定した気象庁エリアコードの防災情報JSONを取得し、発表中(発表/継続)の
// 警報・注意報のうち最も深刻なティアを返す簡易判定関数。
async function fetchAreaSeverity(jmaAreaCode: string): Promise<WarningSeverity | null> {
  const res = await fetch(`https://www.jma.go.jp/bosai/warning/data/warning/${jmaAreaCode}.json`);
  if (!res.ok) throw new Error(`JMA API error: ${res.status}`);
  const data = await res.json();

  let maxSeverity: WarningSeverity | null = null;
  for (const areaType of data?.areaTypes ?? []) {
    for (const area of areaType?.areas ?? []) {
      for (const w of area?.warnings ?? []) {
        // "発表"(新規発表)・"継続"(発表中)のみを有効な警報として扱う
        // ("解除"や空文字ステータスは非表示対象)
        if (w?.status !== "発表" && w?.status !== "継続") continue;
        const severity = classifyWarningCode(w?.code);
        if (severity && (!maxSeverity || SEVERITY_RANK[severity] > SEVERITY_RANK[maxSeverity])) {
          maxSeverity = severity;
        }
      }
    }
  }
  return maxSeverity;
}

// 警報・注意報の半透明塗りつぶしポリゴンレイヤー。
// 都県ごとに気象庁データを取得し、該当する場合のみ色付きポリゴンを描画する。
export function WarningPolygonLayer() {
  const [severities, setSeverities] = useState<Record<string, WarningSeverity | null>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const results = await Promise.allSettled(
        WARNING_REGIONS.map((region) => fetchAreaSeverity(region.jmaAreaCode))
      );
      if (cancelled) return;
      const next: Record<string, WarningSeverity | null> = {};
      results.forEach((result, i) => {
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
      setSeverities(next);
    }

    load();
    const interval = setInterval(load, WARNING_REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <>
      {WARNING_REGIONS.map((region) => {
        const severity = severities[region.jmaAreaCode];
        if (!severity) return null;
        const style = WARNING_SEVERITY_STYLE[severity];
        return (
          <Polygon
            key={region.jmaAreaCode}
            positions={region.polygon}
            interactive={false}
            pathOptions={{
              fillColor: style.fillColor,
              fillOpacity: style.fillOpacity,
              color: "transparent",
              weight: 0,
            }}
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
