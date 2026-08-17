"use client";

import Link from "next/link";
import type { RoadSuggestion } from "@/lib/roads";
import ShootingSuggestionPanel from "./ShootingSuggestionPanel";

function RoadSuggestionsSection({
  title,
  colorDotClass,
  roadSuggestions,
  loading,
  emptyMessage,
  note,
  keyPrefix,
  onHoverRoad,
}: {
  title: string;
  colorDotClass: string;
  roadSuggestions: RoadSuggestion[];
  loading: boolean;
  emptyMessage: string;
  note: string;
  keyPrefix: "park" | "stop";
  onHoverRoad: (key: string | null) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1.5">
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${colorDotClass}`} />
        {title}
      </p>
      {loading && <p className="text-xs text-gray-400">検索中...</p>}
      {!loading && roadSuggestions.length === 0 && (
        <p className="text-xs text-gray-400">{emptyMessage}</p>
      )}
      {!loading && roadSuggestions.length > 0 && (
        <ul className="space-y-1">
          {roadSuggestions.map((road) => (
            <li
              key={road.id}
              className="text-xs text-gray-600 rounded px-1 -mx-1 py-0.5 hover:bg-amber-50 hover:text-amber-800 cursor-default transition-colors"
              onMouseEnter={() => onHoverRoad(`${keyPrefix}-${road.id}`)}
              onMouseLeave={() => onHoverRoad(null)}
            >
              {road.name}
              {road.lanes > 0 && `(車線数: ${road.lanes})`} / 約{Math.round(road.distanceMeters)}m
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-gray-400 mt-1">{note}</p>
    </div>
  );
}

type Props = {
  label: string;
  address: string;
  lat: number;
  lng: number;
  onClose: () => void;
  roadSuggestions: RoadSuggestion[];
  loadingRoads: boolean;
  stopSuggestions: RoadSuggestion[];
  loadingStops: boolean;
  onHoverRoad: (key: string | null) => void;
};

export default function SearchLocationPanel({
  label,
  address,
  lat,
  lng,
  onClose,
  roadSuggestions,
  loadingRoads,
  stopSuggestions,
  loadingStops,
  onHoverRoad,
}: Props) {
  return (
    <div className="flex-1 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="p-3 border-b border-gray-100">
        <button
          onClick={onClose}
          className="text-sm text-blue-600 hover:underline"
        >
          ← 一覧に戻る
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <h2 className="text-lg font-bold">{label}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{address}</p>
          <p className="text-xs text-amber-600 mt-1">まだ現場として未登録です</p>
        </div>

        <Link
          href={`/pin/new?lat=${lat}&lng=${lng}&address=${encodeURIComponent(address)}`}
          className="block text-center bg-blue-600 text-white rounded-lg py-2.5 font-medium text-sm shadow-sm hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150"
        >
          ここに現場を登録する
        </Link>

        <ShootingSuggestionPanel name={label} address={label} lat={lat} lng={lng} />

        <div className="border-t pt-3 space-y-3">
          <RoadSuggestionsSection
            title="駐車できそうな道路(青線)"
            colorDotClass="bg-blue-600"
            roadSuggestions={roadSuggestions}
            loading={loadingRoads}
            emptyMessage="近くに車線数の多い道路データが見つかりませんでした"
            note="※ 長時間の駐車を想定した候補です。実際に駐車できるかは現地で確認してください。"
            keyPrefix="park"
            onHoverRoad={onHoverRoad}
          />
          <RoadSuggestionsSection
            title="駐停車できそうな道路(緑の破線)"
            colorDotClass="bg-green-600"
            roadSuggestions={stopSuggestions}
            loading={loadingStops}
            emptyMessage="近くに道路データが見つかりませんでした"
            note="※ 短時間の停車を想定した、より近い候補です。実際に停車できるかは現地で確認してください。"
            keyPrefix="stop"
            onHoverRoad={onHoverRoad}
          />
        </div>
      </div>
    </div>
  );
}
