"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deletePin, type Pin } from "@/lib/pins";
import ConfirmDialog from "./ConfirmDialog";
import Toast, { type ToastState } from "./Toast";
import DispatchHistorySummary from "./DispatchHistorySummary";
import AiProposalSection from "./AiProposalSection";

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
          className="rounded border border-gray-200 object-cover w-full h-32"
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
      {value && <p className="whitespace-pre-wrap">{value}</p>}
      {photoUrls && <PhotoGrid urls={photoUrls} alt={alt} />}
    </div>
  );
}

export default function PinDetail({ pin }: { pin: Pin }) {
  const router = useRouter();
  const recordedAt = pin.recordedAt?.toDate?.();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deletePin(pin.id);
      router.push("/");
    } catch (err) {
      console.error(err);
      setDeleting(false);
      setDeleteConfirmOpen(false);
      setToast({ type: "error", message: "削除に失敗しました" });
    }
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
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

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{pin.name}</h1>
          <p className="text-gray-600">{pin.address}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link
            href={`/pin/${pin.id}/edit`}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 hover:border-gray-400 hover:shadow-sm active:scale-[0.98] transition-all duration-150"
          >
            編集
          </Link>
          <button
            onClick={() => setDeleteConfirmOpen(true)}
            className="text-sm border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50 hover:border-red-300 hover:shadow-sm active:scale-[0.98] transition-all duration-150"
          >
            削除
          </button>
        </div>
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

      <div className="border-t border-gray-200 pt-4">
        <AiProposalSection pin={pin} />
      </div>

      <DispatchHistorySummary pinId={pin.id} lat={pin.lat} lng={pin.lng} />
    </div>
  );
}
