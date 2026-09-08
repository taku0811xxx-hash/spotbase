"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
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
        // 未来予測(ナウキャスト): 現在時刻から最大30分後まで、10分間隔で数フレーム
        // 提供される(RainViewer側の運用状況により空配列の場合もある)。
        const nowcast = Array.isArray(data?.radar?.nowcast) ? data.radar.nowcast : [];
        if (!data?.host || past.length === 0) return;

        // past/nowcastを時刻(time, UNIX秒)昇順に統合し、万一タイムスタンプが
        // 重複するフレームがあっても1本のタイムラインとして扱えるよう重複除去する。
        const merged = new Map<number, RadarFrame>();
        for (const f of past) {
          if (f?.path && typeof f.time === "number") merged.set(f.time, { path: f.path, time: f.time, isForecast: false });
        }
        for (const f of nowcast) {
          if (f?.path && typeof f.time === "number") merged.set(f.time, { path: f.path, time: f.time, isForecast: true });
        }
        const nextFrames = Array.from(merged.values()).sort((a, b) => a.time - b.time);

        // 「最新の実測フレーム」= 統合後の配列内で isForecast=false の最後のインデックス
        // (=過去/未来予測の境目)。ナウキャスト側でtimeが重複していた場合に備え、
        // past.length-1をそのまま使わずここで再計算する。
        let latestPastIndex = 0;
        for (let i = 0; i < nextFrames.length; i++) {
          if (!nextFrames[i].isForecast) latestPastIndex = i;
        }

        setHost(data.host);
        setFrames(nextFrames);
        setNowIndex(latestPastIndex);
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

// フレームのUNIXタイムスタンプ(秒)を「HH:MM(n分前/最新・現在/n分後・予測)」形式に整形する。
// 例: 過去「14:30(30分前)」/ 現在「15:00(最新・現在)」/ 未来「15:30(30分後・予測)」
function formatFrameLabel(frame: RadarFrame, nowFrameTime: number): string {
  const date = new Date(frame.time * 1000);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const diffMin = Math.round((frame.time - nowFrameTime) / 60);

  let relative: string;
  if (diffMin === 0) {
    relative = "最新・現在";
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
  // RainViewer APIの無料(Personal Use)枠は過去データのみが対象で、予測(nowcast)は
  // 提供されない(公式ドキュメント・サンプルにも明記されている仕様上の制約)。
  // frames配列自体はpast+nowcastを結合する実装になっており、将来nowcastが
  // 提供されるようになれば自動的にスライダー末尾へ反映される。現状は「壊れている」
  // わけではなく未来データが存在しないだけ、と分かるようにここで明示する。
  const hasForecast = frames.some((f) => f.isForecast);

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

      {/* 予測(nowcast)データが1件も無い場合の注記。RainViewer無料APIの仕様上の
          制約であり不具合ではないことをユーザーに明示する(nowcastが提供され
          次第、frames配列に自動的に統合されこの注記も消える)。 */}
      {!hasForecast && (
        <p className="mt-1 pl-9 sm:pl-10 text-[8px] sm:text-[10px] text-gray-400 leading-tight">
          ⚠ 予測データは現在提供されていないため、過去〜現在のみ表示しています
        </p>
      )}
    </div>
  );
}

// ============================================================
// 気象警報・注意報 (気象庁 防災情報JSON + 実境界GeoJSON)
// ============================================================
//
// 従来は都県を単純な矩形(バウンディングボックス)で塗りつぶしていたため、
// 「伊豆諸島(離島・海上)の波浪注意報が内陸の多摩地域にも表示される」といった
// 不整合が生じていた。これは、都道府県コード(例:130000)配下の全エリア
// (東京地方・伊豆諸島北部・伊豆諸島南部・小笠原諸島 等)の警報を単純に
// 合算し、都県全体の1つの矩形へ描画していたことが原因。
//
// 対策として、気象庁の警報JSONが実際に警報・注意報を発表する単位である
// 「一次細分区域(class10)」ごとに個別集計し、区域コード(例:130010=東京地方,
// 130020=伊豆諸島北部)ごとに対応する実境界ポリゴンを取得して描画する方式に
// 変更した。境界データは気象庁が公開する「予報区等GISデータ」を国立情報学
// 研究所(NII)がGeoJSON/TopoJSON化して再配布している「気象庁防災情報発表
// 区域データセット」(CC BY 4.0)を利用し、area.code(気象庁エリアコード)と
// GeoJSON側のproperties.codeが1:1で対応するため、警報データとの紐付けを
// 厳密に行える。
// 参考: https://geoshape.ex.nii.ac.jp/jma/resource/

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

// 対象都県(放送クルーの主な活動エリアである関東主要4都県に限定)。
// ここで持つのは都道府県コードのみで、実際に警報が発表される単位である
// 一次細分区域(class10)のコード・名称・境界は気象庁の警報JSON/境界データから
// 動的に取得する(ハードコードしない)。
const TARGET_PREFECTURES: { name: string; jmaPrefCode: string }[] = [
  { name: "東京都", jmaPrefCode: "130000" },
  { name: "神奈川県", jmaPrefCode: "140000" },
  { name: "埼玉県", jmaPrefCode: "110000" },
  { name: "千葉県", jmaPrefCode: "120000" },
];

const WARNING_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// 一次細分区域(class10)単位で発表中の警報・注意報を集計した結果
type Class10Warning = {
  code: string; // 一次細分区域コード(例: "130010")。GeoJSON側のproperties.codeと1:1対応
  name: string; // 区域名(例: "東京地方")
  severity: WarningSeverity;
  names: string[]; // 発令中の警報・注意報の具体名一覧
};

// 指定した都道府県の警報JSONを取得し、一次細分区域(areaTypes[0] = class10)
// ごとに発表中(発表/継続)の警報・注意報を集計する。
// 注意: areaTypes[1]以降(市区町村等のより細かい区域)は集計対象に含めない。
// これは、区域ごとの塗りつぶし単位を「実境界ポリゴンを個別取得できる
// class10レベル」に統一するためであり、結果として「伊豆諸島の波浪注意報が
// 東京地方(内陸含む)全体に誤って適用される」といった不整合を防げる
// (例: 130010=東京地方 と 130020=伊豆諸島北部 は別区域として個別に集計される)。
async function fetchPrefectureClass10Warnings(jmaPrefCode: string): Promise<Class10Warning[]> {
  const res = await fetch(`https://www.jma.go.jp/bosai/warning/data/warning/${jmaPrefCode}.json`);
  if (!res.ok) throw new Error(`JMA API error: ${res.status}`);
  const data = await res.json();

  const class10Areas = data?.areaTypes?.[0]?.areas ?? [];
  const results: Class10Warning[] = [];

  for (const area of class10Areas) {
    if (!area?.code) continue;
    let maxSeverity: WarningSeverity | null = null;
    const names = new Set<string>();

    for (const w of area?.warnings ?? []) {
      // "発表"(新規発表)・"継続"(発表中)のみを有効な警報として扱う
      // ("解除"や「発表警報・注意報はなし」等のステータスは非表示対象)
      if (w?.status !== "発表" && w?.status !== "継続") continue;
      const info = classifyWarningCode(w?.code);
      if (!info) continue;
      names.add(info.name);
      if (!maxSeverity || SEVERITY_RANK[info.severity] > SEVERITY_RANK[maxSeverity]) {
        maxSeverity = info.severity;
      }
    }

    if (maxSeverity) {
      results.push({ code: area.code, name: area.name ?? area.code, severity: maxSeverity, names: Array.from(names) });
    }
  }

  return results;
}

// ============================================================
// 実境界ポリゴン取得 (NII Geoshapeリポジトリ「気象庁防災情報発表区域データセット」)
// ============================================================

// 一次細分区域(class10)の境界GeoJSON配布元。ファイル名が気象庁のエリアコードと
// 完全一致するため、"{code}.geojson"で該当区域のポリゴンを直接取得できる。
const AREA_BOUNDARY_BASE_URL =
  "https://geoshape.ex.nii.ac.jp/jma/resource/AreaForecastLocalM_1saibun/20190125";

type LngLat = [number, number]; // GeoJSON座標順 [lng, lat]

type AreaBoundary = {
  code: string;
  name: string; // 区域名(境界GeoJSONのproperties.nameから取得。気象庁の警報JSON自体にはname項目がないため)
  geoJson: GeoJSON.Feature; // 簡略化済みのPolygon/MultiPolygon
  centroid: [number, number]; // ラベル配置用の代表座標 [lat, lng]
};

// --- Douglas-Peucker簡略化(海岸線の点数を減らし描画負荷を抑える。外部ライブラリ不使用) ---

function perpendicularDistance(point: LngLat, lineStart: LngLat, lineEnd: LngLat): number {
  const [x, y] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(x - x1, y - y1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lenSq));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function douglasPeucker(points: LngLat[], tolerance: number): LngLat[] {
  if (points.length < 3) return points;
  let maxDist = 0;
  let maxIndex = 0;
  const start = points[0];
  const end = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }
  if (maxDist > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  return [start, end];
}

function simplifyRing(ring: LngLat[], tolerance: number): LngLat[] {
  if (ring.length <= 4) return ring; // 三角形+閉包点程度は簡略化しない
  const simplified = douglasPeucker(ring, tolerance);
  return simplified.length >= 4 ? simplified : ring; // 潰れすぎた場合は元の形状を維持
}

// ズームレベルの低い(広域)地図での描画負荷を抑えるための座標簡略化許容誤差(度)。
// 約0.0015度 ≈ 150m程度の誤差を許容する。
const BOUNDARY_SIMPLIFY_TOLERANCE = 0.0015;

function simplifyGeoJsonFeature(feature: GeoJSON.Feature, tolerance: number): GeoJSON.Feature {
  const geometry = feature.geometry;
  if (!geometry) return feature;

  if (geometry.type === "Polygon") {
    const rings = (geometry.coordinates as unknown as LngLat[][]).map((ring) => simplifyRing(ring, tolerance));
    return { ...feature, geometry: { ...geometry, coordinates: rings as any } };
  }
  if (geometry.type === "MultiPolygon") {
    const polygons = (geometry.coordinates as unknown as LngLat[][][]).map((poly) =>
      poly.map((ring) => simplifyRing(ring, tolerance))
    );
    return { ...feature, geometry: { ...geometry, coordinates: polygons as any } };
  }
  return feature;
}

// --- 重心(Centroid)計算 ---
// シューレース公式による符号付き面積・重心の計算。MultiPolygonの場合は
// 最大面積の陸地(外環)を代表座標として採用する(離島などで複数の陸地に
// 分かれる区域でも、ラベルが海上に浮かばないようにするため)。

function ringSignedArea(ring: LngLat[]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function ringCentroid(ring: LngLat[]): { lat: number; lng: number; area: number } {
  const area = ringSignedArea(ring);
  if (Math.abs(area) < 1e-12) {
    const [lngSum, latSum] = ring.reduce(([lng, lat], [x, y]) => [lng + x, lat + y], [0, 0]);
    return { lat: latSum / ring.length, lng: lngSum / ring.length, area: 0 };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const cross = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  return { lat: cy / (6 * area), lng: cx / (6 * area), area: Math.abs(area) };
}

function computeFeatureCentroid(feature: GeoJSON.Feature): [number, number] {
  const geometry = feature.geometry;
  const exteriorRings: LngLat[][] =
    geometry?.type === "Polygon"
      ? [geometry.coordinates[0] as unknown as LngLat[]]
      : geometry?.type === "MultiPolygon"
        ? (geometry.coordinates as unknown as LngLat[][][]).map((poly) => poly[0])
        : [];

  let best: { lat: number; lng: number; area: number } | null = null;
  for (const ring of exteriorRings) {
    const c = ringCentroid(ring);
    if (!best || c.area > best.area) best = c;
  }
  return best ? [best.lat, best.lng] : [35.681236, 139.767125]; // フォールバック(東京駅付近)
}

// 取得済み境界ポリゴンをモジュールスコープでキャッシュする(境界データ自体は
// ほぼ不変のため、セッション中はトグルON/OFFを繰り返しても再取得しない)。
const areaBoundaryCache = new globalThis.Map<string, AreaBoundary>();
const areaBoundaryInFlight = new globalThis.Map<string, Promise<AreaBoundary | null>>();

// 指定した区域コードの実境界ポリゴンを取得する。発令中の区域についてのみ
// 呼び出すことで、無関係な区域(例: 警報の出ていない離島)の大きなGeoJSON
// ファイルまで無条件にダウンロードしてしまう帯域の無駄を避けている。
async function fetchAreaBoundary(code: string): Promise<AreaBoundary | null> {
  const cached = areaBoundaryCache.get(code);
  if (cached) return cached;
  const inFlight = areaBoundaryInFlight.get(code);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const res = await fetch(`${AREA_BOUNDARY_BASE_URL}/${code}.geojson`);
      if (!res.ok) throw new Error(`Area boundary fetch error: ${res.status}`);
      const raw = await res.json();
      const feature: GeoJSON.Feature | undefined = raw?.features?.[0];
      if (!feature?.geometry) return null;

      const simplified = simplifyGeoJsonFeature(feature, BOUNDARY_SIMPLIFY_TOLERANCE);
      const centroid = computeFeatureCentroid(simplified);
      const name = (simplified.properties as { name?: string } | null)?.name ?? code;
      const boundary: AreaBoundary = { code, name, geoJson: simplified, centroid };
      areaBoundaryCache.set(code, boundary);
      return boundary;
    } catch (error) {
      console.warn(`[JMA境界] エリアコード${code}の境界データ取得に失敗しました:`, error);
      return null;
    } finally {
      areaBoundaryInFlight.delete(code);
    }
  })();

  areaBoundaryInFlight.set(code, promise);
  return promise;
}

// ============================================================
// 警報テキストの省略表示ロジック
// ============================================================

// 名称末尾の警報種別サフィックス。判定順が重要("特別警報"は"警報"でも終わるため先に判定する)
const WARNING_NAME_SUFFIXES = ["特別警報", "警報", "注意報"] as const;

function splitWarningNameSuffix(name: string): { root: string; suffix: string } {
  for (const suffix of WARNING_NAME_SUFFIXES) {
    if (name.endsWith(suffix)) {
      return { root: name.slice(0, name.length - suffix.length), suffix };
    }
  }
  return { root: name, suffix: "" };
}

// 3件以上発令されている場合や広域ズーム時に文字あふれ・重なりを防ぐための要約表示。
// 例: 「雷注意報 / 濃霧注意報 / 強風注意報」→「⚡雷・濃霧・強風注意報」
// 種別(警報/注意報等)が混在していて綺麗にまとめられない場合は件数表示にフォールバックする。
function summarizeWarningNames(names: string[], severity: WarningSeverity): string {
  const groupsBySuffix = new globalThis.Map<string, string[]>();
  for (const name of names) {
    const { root, suffix } = splitWarningNameSuffix(name);
    if (!groupsBySuffix.has(suffix)) groupsBySuffix.set(suffix, []);
    groupsBySuffix.get(suffix)!.push(root);
  }

  if (groupsBySuffix.size === 1) {
    const [suffix, roots] = Array.from(groupsBySuffix.entries())[0];
    return `⚡${roots.join("・")}${suffix}`;
  }

  // 警報と注意報が混在する等、単純に繋げると分かりにくい場合は件数表示にする
  const severityLabel = severity === "special" ? "特別警報等" : severity === "warning" ? "警報等" : "注意報等";
  return `${severityLabel} (${names.length}件)`;
}

// 表示テキストを決定する。3件以上、または広域ズーム(zoom<=8)の場合は要約表示にする。
function resolveWarningLabelText(names: string[], severity: WarningSeverity, zoom: number): { text: string } {
  const shouldSummarize = names.length >= 3 || zoom <= 8;
  return shouldSummarize
    ? { text: summarizeWarningNames(names, severity) }
    : { text: names.join(" / ") };
}

// 警報ラベル用divIconをキャッシュしつつ生成する(同一内容の再生成を避けるため)
const warningLabelIconCache = new globalThis.Map<string, L.DivIcon>();

function getWarningLabelIcon(text: string, severity: WarningSeverity): L.DivIcon {
  const cacheKey = `${severity}:${text}`;
  const cached = warningLabelIconCache.get(cacheKey);
  if (cached) return cached;

  const style = WARNING_LABEL_STYLE[severity];

  const icon = L.divIcon({
    className: "",
    // 注意: Leafletのdivicon親要素はiconSize:[0,0]によりwidth:0のままなので、
    // 子要素のwidth:autoによるshrink-to-fit計算(利用可能幅=containing blockの幅)が
    // 常に0とみなされ、white-space:normal指定時に1文字ごとに折り返されてしまう
    // (position:absolute/relativeのどちらでも起こる)。width:max-contentを明示することで
    // shrink-to-fitの利用可能幅計算を経由せず内容ベースの幅になり、max-widthで
    // 正しく140pxにクランプされるようになる。
    html: `<div style="
      position: absolute;
      left: -50%;
      top: -50%;
      width: max-content;
      max-width: 140px;
      background: ${style.bg};
      color: ${style.text};
      font-weight: 700;
      font-size: 10.5px;
      line-height: 1.3;
      padding: 3px 6px;
      white-space: normal;
      word-break: break-all;
      text-align: center;
      border-radius: 4px;
      border: 1px solid ${style.border};
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      cursor: pointer;
    ">${text.replace(/</g, "&lt;")}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
  warningLabelIconCache.set(cacheKey, icon);
  return icon;
}

// ============================================================
// 共有フック: 発令中の一次細分区域一覧 + 対応する実境界ポリゴン
// ============================================================

function useActiveWarningAreas() {
  const [areas, setAreas] = useState<Class10Warning[]>([]);
  const [boundaries, setBoundaries] = useState<Record<string, AreaBoundary>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const perPrefecture = await Promise.allSettled(
        TARGET_PREFECTURES.map((p) => fetchPrefectureClass10Warnings(p.jmaPrefCode))
      );
      if (cancelled) return;

      const activeAreas: Class10Warning[] = [];
      perPrefecture.forEach((result, i) => {
        if (result.status === "fulfilled") {
          activeAreas.push(...result.value);
        } else {
          console.warn(
            `[JMA] ${TARGET_PREFECTURES[i].name}の警報情報取得に失敗しました:`,
            result.reason
          );
        }
      });
      setAreas(activeAreas);

      // 発令中の区域についてのみ実境界ポリゴンを取得する(未発令の区域は
      // ポリゴン自体不要なため、無駄なデータ転送を避ける)
      const fetched = await Promise.allSettled(activeAreas.map((a) => fetchAreaBoundary(a.code)));
      if (cancelled) return;
      setBoundaries((prev) => {
        const next = { ...prev };
        fetched.forEach((result) => {
          if (result.status === "fulfilled" && result.value) {
            next[result.value.code] = result.value;
          }
        });
        return next;
      });
    }

    load();
    const interval = setInterval(load, WARNING_REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { areas, boundaries };
}

// 警報・注意報の実境界ポリゴン塗りつぶし。
export function WarningPolygonLayer() {
  const { areas, boundaries } = useActiveWarningAreas();

  return (
    <>
      {areas.map((area) => {
        const boundary = boundaries[area.code];
        if (!boundary) return null; // 境界データ取得中/失敗時はまだ描画しない
        const fillStyle = WARNING_SEVERITY_FILL[area.severity];
        return (
          <GeoJSON
            key={area.code}
            data={boundary.geoJson as any}
            interactive={false}
            style={{
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

// ============================================================
// ラベルの重なり防止(クラスタリング)
// ============================================================

// 隣接する区域同士のラベルが重ならないよう、現在のズーム/表示範囲における
// 画面ピクセル距離が近いラベル同士を1つの代表ラベルへ統合するためのしきい値(px)。
const LABEL_CLUSTER_DISTANCE_PX = 70;

type ActiveAreaForLabel = {
  code: string;
  name: string;
  severity: WarningSeverity;
  names: string[];
  centroid: [number, number];
};

type LabelCluster = {
  position: [number, number];
  names: string[]; // 統合後の重複除去済み名称一覧(要約表示の判定に使う)
  severity: WarningSeverity;
  members: { regionName: string; names: string[] }[]; // ポップアップでの内訳表示用
};

// 現在の地図表示状態(ズーム)で各区域ラベルの画面座標を計算し、
// 一定距離内にあるものを1クラスタにまとめる。
function clusterActiveAreas(map: L.Map, activeAreas: ActiveAreaForLabel[]): LabelCluster[] {
  const n = activeAreas.length;
  if (n === 0) return [];

  const zoom = map.getZoom();
  const points = activeAreas.map((a) => map.project(L.latLng(a.centroid), zoom));

  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  function union(a: number, b: number) {
    parent[find(a)] = find(b);
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (points[i].distanceTo(points[j]) < LABEL_CLUSTER_DISTANCE_PX) {
        union(i, j);
      }
    }
  }

  const groups = new globalThis.Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }

  return Array.from(groups.values()).map((idxs) => {
    const items = idxs.map((i) => activeAreas[i]);
    const avgLat = items.reduce((sum, it) => sum + it.centroid[0], 0) / items.length;
    const avgLng = items.reduce((sum, it) => sum + it.centroid[1], 0) / items.length;

    const names = Array.from(new Set(items.flatMap((it) => it.names)));
    const severity = items.reduce<WarningSeverity>(
      (max, it) => (SEVERITY_RANK[it.severity] > SEVERITY_RANK[max] ? it.severity : max),
      items[0].severity
    );

    return {
      position: [avgLat, avgLng],
      names,
      severity,
      members: items.map((it) => ({ regionName: it.name, names: it.names })),
    };
  });
}

// ポップアップの内訳表示。区域ごとに発令中の警報・注意報名を列挙する。
function WarningPopupDetail({ members }: { members: LabelCluster["members"] }) {
  return (
    <div className="text-xs space-y-1.5 max-w-[220px]">
      {members.map((m) => (
        <div key={m.regionName}>
          <p className="font-bold text-gray-900">{m.regionName}</p>
          <p className="text-gray-700">{m.names.join("、")}</p>
        </div>
      ))}
    </div>
  );
}

// 警報・注意報の具体名テキストラベル(「大雨警報 / 洪水注意報」等)。
// ハザードマップ/雨雲レーダーのタイルより確実に前面へ出す必要があるため、
// ポリゴン塗り(WarningPolygonLayer)とは別の高いzIndexのPaneで描画する想定
// (呼び出し側でPane配置を行う)。
// - 各区域の実境界ポリゴンの重心(最大陸地の面積重心)にラベルを配置する
// - 3件以上発令中/広域ズーム時は要約表示にし、クリックで内訳ポップアップを開ける
// - 近接する区域のラベルは1つに統合し、重なりを防ぐ
export function WarningLabelLayer() {
  const { areas, boundaries } = useActiveWarningAreas();
  const map = useMap();
  const [viewTick, setViewTick] = useState(0);

  useMapEvents({
    zoomend() {
      setViewTick((t) => t + 1);
    },
    moveend() {
      setViewTick((t) => t + 1);
    },
  });

  const activeAreas = useMemo<ActiveAreaForLabel[]>(
    () =>
      areas
        .map((a) => {
          const boundary = boundaries[a.code];
          if (!boundary) return null;
          // 気象庁の警報JSON自体には区域名が含まれないため、境界GeoJSON側の
          // properties.name(実際の区域名)を優先して使う
          return { code: a.code, name: boundary.name, severity: a.severity, names: a.names, centroid: boundary.centroid };
        })
        .filter((v): v is ActiveAreaForLabel => v !== null),
    [areas, boundaries]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps -- viewTickは再計算トリガー用
  const clusters = useMemo(() => clusterActiveAreas(map, activeAreas), [map, activeAreas, viewTick]);

  const zoom = map.getZoom();

  return (
    <>
      {clusters.map((cluster, i) => {
        const { text } = resolveWarningLabelText(cluster.names, cluster.severity, zoom);
        return (
          <Marker
            key={i}
            position={cluster.position}
            icon={getWarningLabelIcon(text, cluster.severity)}
            keyboard={false}
          >
            <Popup>
              <WarningPopupDetail members={cluster.members} />
            </Popup>
          </Marker>
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
