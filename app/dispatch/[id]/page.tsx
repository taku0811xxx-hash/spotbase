"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  deleteDispatchRecord,
  getDispatchRecord,
  type DispatchRecord,
} from "@/lib/dispatchRecords";
import PageHeader from "@/components/PageHeader";
import ConfirmDialog from "@/components/ConfirmDialog";
import Toast, { type ToastState } from "@/components/Toast";

export default function DispatchDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [record, setRecord] = useState<DispatchRecord | null | undefined>(undefined);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    getDispatchRecord(params.id).then(setRecord);
  }, [params.id]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteDispatchRecord(params.id);
      router.push("/dispatch");
    } catch (err) {
      console.error(err);
      setDeleting(false);
      setDeleteConfirmOpen(false);
      setToast({ type: "error", message: "削除に失敗しました" });
    }
  }

  if (record === undefined) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="読み込み中..." backHref="/dispatch" backLabel="一覧に戻る" />
        <p className="p-4 text-sm text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (record === null) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="見つかりません" backHref="/dispatch" backLabel="一覧に戻る" />
        <p className="p-4 text-sm text-gray-500">この出動記録は見つかりませんでした。</p>
      </div>
    );
  }

  const createdAt = record.createdAt?.toDate?.();

  return (
    <div className="min-h-screen bg-gray-50">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="この出動記録を削除しますか?"
        summary={[{ label: "場所名", value: record.locationName }]}
        confirmLabel="削除する"
        submitting={deleting}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
      />
      <PageHeader
        title={record.locationName}
        backHref="/dispatch"
        backLabel="一覧に戻る"
        action={
          <Link
            href={`/dispatch/${record.id}/report`}
            className="bg-blue-600 text-white text-sm font-medium rounded-lg px-4 py-2 shadow-sm hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150"
          >
            報告書を作成
          </Link>
        }
      />

      <div className="max-w-2xl mx-auto p-5 sm:p-10 space-y-5">
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{record.locationName}</h1>
            {record.incidentType && (
              <p className="text-sm text-gray-600 mt-0.5">{record.incidentType}</p>
            )}
            <p className="text-xs text-gray-500 mt-2">
              記録者: {record.recordedBy || "不明"}
              {createdAt && ` / ${createdAt.toLocaleString("ja-JP")}`}
            </p>
          </div>
          <button
            onClick={() => setDeleteConfirmOpen(true)}
            className="text-sm border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50 hover:border-red-300 transition-all duration-150 flex-shrink-0"
          >
            削除
          </button>
        </div>

        {(record.parkingInfo || record.shootingSpots || record.ipTransmissionInfo || record.fpuInfo || record.hazards) && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            <h2 className="font-semibold text-gray-900">現場情報</h2>
            {record.parkingInfo && (
              <div>
                <p className="text-xs text-gray-500">駐車場所</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{record.parkingInfo}</p>
              </div>
            )}
            {record.shootingSpots && (
              <div>
                <p className="text-xs text-gray-500">撮影ポイント</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{record.shootingSpots}</p>
              </div>
            )}
            {record.ipTransmissionInfo && (
              <div>
                <p className="text-xs text-gray-500">携帯回線(IP伝送)の状況</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{record.ipTransmissionInfo}</p>
              </div>
            )}
            {record.fpuInfo && (
              <div>
                <p className="text-xs text-gray-500">FPU伝送の状況</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{record.fpuInfo}</p>
              </div>
            )}
            {record.hazards && (
              <div>
                <p className="text-xs text-gray-500">危険箇所・注意事項</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{record.hazards}</p>
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-3">チェックポイント</h2>
          {record.checkpoints.length === 0 && (
            <p className="text-sm text-gray-500">記録がありません</p>
          )}
          {record.checkpoints.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="pb-2 font-medium">コメント</th>
                  <th className="pb-2 font-medium">時刻</th>
                  <th className="pb-2 font-medium">位置</th>
                </tr>
              </thead>
              <tbody>
                {record.checkpoints.map((cp, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 font-medium text-gray-800">{cp.comment}</td>
                    <td className="py-2 text-gray-600">
                      {new Date(cp.time).toLocaleString("ja-JP")}
                    </td>
                    <td className="py-2 text-gray-500">
                      {cp.lat.toFixed(5)}, {cp.lng.toFixed(5)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-2">リアルタイム軌跡</h2>
          <p className="text-sm text-gray-600">{record.track.length}件のポイントを記録</p>
          {record.track.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              {new Date(record.track[0].time).toLocaleTimeString("ja-JP")} 〜{" "}
              {new Date(record.track[record.track.length - 1].time).toLocaleTimeString("ja-JP")}
            </p>
          )}
        </div>

        {record.notes?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            <h2 className="font-semibold text-gray-900">記録メモ</h2>
            {record.notes.map((note, i) => (
              <div key={i} className="border-t border-gray-100 pt-3 first:border-0 first:pt-0">
                {note.title && (
                  <p className="text-sm font-medium text-gray-800">{note.title}</p>
                )}
                <p className="text-sm text-gray-700 whitespace-pre-wrap mt-0.5">{note.body}</p>
              </div>
            ))}
          </div>
        )}

        {record.photos?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-3">現場写真</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {record.photos.map((photo, i) => (
                <div key={i}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.caption || ""}
                    className="w-full h-28 object-cover rounded border border-gray-200"
                  />
                  {photo.caption && (
                    <p className="text-xs text-gray-500 mt-1">{photo.caption}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {record.equipmentHeaders?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-3">持ち出した機材</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    {record.equipmentHeaders.map((h, i) => (
                      <th
                        key={i}
                        className="text-left font-medium text-gray-700 px-3 py-2 border-b border-gray-200 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {record.equipmentRows.map((row, ri) => (
                    <tr key={ri} className="hover:bg-gray-50">
                      {record.equipmentHeaders.map((_, ci) => (
                        <td
                          key={ci}
                          className="px-3 py-2 border-b border-gray-100 text-gray-700 whitespace-nowrap"
                        >
                          {row[ci] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
