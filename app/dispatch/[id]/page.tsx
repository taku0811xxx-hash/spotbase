"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  deleteDispatchRecord,
  getDispatchRecord,
  getDispatchRecordsNear,
  type DispatchRecord,
} from "@/lib/dispatchRecords";
import { useAuth } from "@/components/AuthProvider";
import PageHeader from "@/components/PageHeader";
import ConfirmDialog from "@/components/ConfirmDialog";
import Toast, { type ToastState } from "@/components/Toast";

type PinSummary = {
  parkingInfo: string;
  shootingSpots: string;
  ipTransmissionInfo: string;
  fpuInfo: string;
  hazards: string;
};

export default function DispatchDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const [record, setRecord] = useState<DispatchRecord | null | undefined>(undefined);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [generating, setGenerating] = useState(false);
  const [sourceCount, setSourceCount] = useState<number | null>(null);

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

  // この場所の付近にある出動記録をすべて集めて、AIに現場記録としてまとめさせてから
  // 現場登録フォームに渡す
  async function handleGeneratePinSummary() {
    if (!record || record.lat == null || record.lng == null || !profile) return;
    setGenerating(true);
    try {
      const nearby = await getDispatchRecordsNear(
        record.lat,
        record.lng,
        {
          organizationId: profile.organizationId,
          category: profile.category,
          isAdmin: profile.accessLevel === "admin",
        }
      );
      const source = nearby.length > 0 ? nearby : [record];
      setSourceCount(source.length);

      const res = await fetch("/api/generate-pin-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationName: record.locationName,
          address: record.address,
          records: source.map((r) => ({
            date: r.createdAt?.toDate?.()?.toLocaleDateString("ja-JP") ?? "",
            incidentType: r.incidentType,
            parkingInfo: r.parkingInfo,
            shootingSpots: r.shootingSpots,
            ipTransmissionInfo: r.ipTransmissionInfo,
            fpuInfo: r.fpuInfo,
            hazards: r.hazards,
            notes: r.notes,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ type: "error", message: data.error || "現場記録の生成に失敗しました" });
        return;
      }
      const summary = data.summary as PinSummary;

      const query = new URLSearchParams({
        lat: String(record.lat),
        lng: String(record.lng),
        name: record.locationName,
        address: record.address ?? "",
        parkingInfo: summary.parkingInfo ?? "",
        shootingSpots: summary.shootingSpots ?? "",
        ipTransmissionInfo: summary.ipTransmissionInfo ?? "",
        fpuInfo: summary.fpuInfo ?? "",
        hazards: summary.hazards ?? "",
      });
      router.push(`/pin/new?${query.toString()}`);
    } catch (err) {
      console.error(err);
      setToast({ type: "error", message: "現場記録の生成に失敗しました" });
    } finally {
      setGenerating(false);
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
  const canGeneratePin = record.lat != null && record.lng != null;

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
            {record.address && (
              <p className="text-xs text-gray-500 mt-0.5">{record.address}</p>
            )}
            {record.incidentType && (
              <p className="text-sm text-gray-600 mt-0.5">{record.incidentType}</p>
            )}
            <p className="text-xs text-gray-500 mt-2">
              記録者: {record.recordedBy || "不明"}
              {createdAt && ` / ${createdAt.toLocaleString("ja-JP")}`}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Link
              href={`/dispatch/${record.id}/edit`}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 hover:border-gray-400 transition-all duration-150"
            >
              編集
            </Link>
            {canGeneratePin && (
              <button
                onClick={handleGeneratePinSummary}
                disabled={generating}
                className="flex items-center gap-1.5 text-sm border border-blue-200 text-blue-600 bg-blue-50 rounded-lg px-3 py-1.5 hover:bg-blue-100 hover:border-blue-300 transition-all duration-150 disabled:opacity-50"
              >
                {generating && (
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
                  </svg>
                )}
                {generating ? "この場所の出動記録を集めて生成中..." : "現場記録を自動生成"}
              </button>
            )}
            <button
              onClick={() => setDeleteConfirmOpen(true)}
              className="text-sm border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50 hover:border-red-300 transition-all duration-150"
            >
              削除
            </button>
          </div>
        </div>

        {canGeneratePin && sourceCount != null && (
          <p className="text-xs text-gray-400 -mt-3">
            付近の出動記録{sourceCount}件から現場記録を生成しています
          </p>
        )}

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
        {record.history?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-3">編集履歴</h2>
            <ul className="space-y-2">
              {[...record.history].reverse().map((entry, i) => {
                const editedAt = entry.editedAt?.toDate?.();
                return (
                  <li key={i} className="text-xs text-gray-600 border-b border-gray-50 last:border-0 pb-2 last:pb-0">
                    <span className="font-medium text-gray-800">{entry.editedBy}</span>
                    {editedAt && ` が ${editedAt.toLocaleString("ja-JP")} に`}
                    {" "}
                    {entry.changedFields.join("・")} を変更
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
