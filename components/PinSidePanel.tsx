"use client";

import Link from "next/link";
import { useState } from "react";
import { deletePin, type Pin } from "@/lib/pins";
import type { RoadSuggestion } from "@/lib/roads";
import ConfirmDialog from "./ConfirmDialog";
import Toast, { type ToastState } from "./Toast";
import ShootingSuggestionPanel from "./ShootingSuggestionPanel";
import DispatchHistorySummary from "./DispatchHistorySummary";

function PhotoGrid({ urls, alt }: { urls: string[]; alt: string }) {
  if (urls.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {urls.map((url) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          src={url}
          alt={alt}
          className="rounded border border-gray-200 object-cover w-full h-24"
        />
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  photoUrls,
  alt,
}: {
  label: string;
  value?: string;
  photoUrls?: string[];
  alt: string;
}) {
  if (!value && (!photoUrls || photoUrls.length === 0)) return null;
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      {value && <p className="text-sm whitespace-pre-wrap">{value}</p>}
      {photoUrls && <PhotoGrid urls={photoUrls} alt={alt} />}
    </div>
  );
}

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
  pin: Pin;
  onClose: () => void;
  onDeleted?: () => void;
  roadSuggestions: RoadSuggestion[];
  loadingRoads: boolean;
  stopSuggestions: RoadSuggestion[];
  loadingStops: boolean;
  onHoverRoad: (key: string | null) => void;
};

export default function PinSidePanel({
  pin,
  onClose,
  onDeleted,
  roadSuggestions,
  loadingRoads,
  stopSuggestions,
  loadingStops,
  onHoverRoad,
}: Props) {
  const recordedAt = pin.recordedAt?.toDate?.();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deletePin(pin.id);
      setDeleteConfirmOpen(false);
      onDeleted?.();
    } catch (err) {
      console.error(err);
      setDeleting(false);
      setDeleteConfirmOpen(false);
      setToast({ type: "error", message: "削除に失敗しました" });
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-sm">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="この現場情報を削除しますか?"
        summary={[{ label: "現場名", value: pin.name }]}
        confirmLabel="削除する"
        submitting={deleting}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
      />

      <div className="p-3 border-b border-gray-100 flex items-center justify-between">
        <button
          onClick={onClose}
          className="text-sm text-blue-600 hover:underline"
        >
          ← 一覧に戻る
        </button>
        <div className="flex gap-2">
          <Link
            href={`/pin/${pin.id}/edit`}
            className="text-xs border border-gray-300 rounded-lg px-2.5 py-1 hover:bg-gray-50 hover:border-gray-400 hover:shadow-sm active:scale-[0.98] transition-all duration-150"
          >
            編集
          </Link>
          <button
            onClick={() => setDeleteConfirmOpen(true)}
            className="text-xs border border-red-200 text-red-600 rounded-lg px-2.5 py-1 hover:bg-red-50 hover:border-red-300 hover:shadow-sm active:scale-[0.98] transition-all duration-150"
          >
            削除
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <h2 className="text-lg font-bold">{pin.name}</h2>
          <p className="text-gray-600 text-sm">{pin.address}</p>
        </div>

        <div className="text-xs text-gray-500">
          {recordedAt && `最終更新: ${recordedAt.toLocaleDateString("ja-JP")}`}
        </div>

        <Field label="駐車場所" value={pin.parkingInfo} alt={pin.name} />
        <Field
          label="撮影ポイント"
          value={pin.shootingSpots}
          photoUrls={pin.shootingPhotoUrls}
          alt={`${pin.name} 撮影ポイント`}
        />
        <Field label="携帯回線(IP伝送)の状況" value={pin.ipTransmissionInfo} alt={pin.name} />
        <Field label="FPU伝送の状況" value={pin.fpuInfo} alt={pin.name} />
        {pin.signalInfo && (
          <Field label="電波状況(旧項目)" value={pin.signalInfo} alt={pin.name} />
        )}
        <Field
          label="危険箇所・注意事項"
          value={pin.hazards}
          photoUrls={pin.hazardPhotoUrls}
          alt={`${pin.name} 危険箇所`}
        />

        {pin.photoUrls.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">現場全体の写真</p>
            <PhotoGrid urls={pin.photoUrls} alt={pin.name} />
          </div>
        )}

        <ShootingSuggestionPanel
          name={pin.name}
          address={pin.address}
          lat={pin.lat}
          lng={pin.lng}
        />

        <DispatchHistorySummary pinId={pin.id} lat={pin.lat} lng={pin.lng} />

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
