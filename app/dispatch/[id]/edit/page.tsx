"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import {
  getDispatchRecord,
  updateDispatchRecord,
  type DispatchRecord,
  type NoteEntry,
} from "@/lib/dispatchRecords";
import { useAuth } from "@/components/AuthProvider";
import { geocodeQuery, reverseGeocode } from "@/lib/geocode";
import PageHeader from "@/components/PageHeader";
import Toast, { type ToastState } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";

// LeafletはSSR非対応なのでクライアント側のみで読み込む
const LocationPicker = dynamic(() => import("@/components/LocationPicker"), {
  ssr: false,
});

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  );
}

const inputClass =
  "w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

export default function EditDispatchPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();

  const [record, setRecord] = useState<DispatchRecord | null | undefined>(undefined);
  const [locationName, setLocationName] = useState("");
  const [address, setAddress] = useState("");
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [incidentType, setIncidentType] = useState("");
  const [parkingInfo, setParkingInfo] = useState("");
  const [shootingSpots, setShootingSpots] = useState("");
  const [ipTransmissionInfo, setIpTransmissionInfo] = useState("");
  const [fpuInfo, setFpuInfo] = useState("");
  const [hazards, setHazards] = useState("");
  const [notes, setNotes] = useState<NoteEntry[]>([{ title: "", body: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const positionLockedRef = useRef(true); // 編集画面では最初から位置が決まっている想定

  useEffect(() => {
    getDispatchRecord(params.id).then((r) => {
      setRecord(r);
      if (r) {
        setLocationName(r.locationName);
        setAddress(r.address ?? "");
        if (r.lat != null && r.lng != null) setPosition({ lat: r.lat, lng: r.lng });
        setIncidentType(r.incidentType);
        setParkingInfo(r.parkingInfo);
        setShootingSpots(r.shootingSpots);
        setIpTransmissionInfo(r.ipTransmissionInfo);
        setFpuInfo(r.fpuInfo);
        setHazards(r.hazards);
        setNotes(r.notes.length > 0 ? r.notes : [{ title: "", body: "" }]);
      }
    });
  }, [params.id]);

  async function handlePositionChange(pos: { lat: number; lng: number }) {
    positionLockedRef.current = true;
    setPosition(pos);
    setAddressLoading(true);
    try {
      const found = await reverseGeocode(pos.lat, pos.lng);
      if (found) setAddress(found);
    } catch (err) {
      console.error(err);
    } finally {
      setAddressLoading(false);
    }
  }

  function addNoteEntry() {
    setNotes((prev) => [...prev, { title: "", body: "" }]);
  }
  function updateNoteEntry(index: number, field: "title" | "body", value: string) {
    setNotes((prev) => prev.map((n, i) => (i === index ? { ...n, [field]: value } : n)));
  }
  function removeNoteEntry(index: number) {
    setNotes((prev) => prev.filter((_, i) => i !== index));
  }

  function handleOpenConfirm(e: React.FormEvent) {
    e.preventDefault();
    setConfirmOpen(true);
  }

  async function handleConfirmedSubmit() {
    if (!profile) {
      setToast({ type: "error", message: "ログインしてください" });
      return;
    }
    setSubmitting(true);
    try {
      await updateDispatchRecord(
        params.id,
        {
          locationName,
          address,
          lat: position?.lat ?? null,
          lng: position?.lng ?? null,
          incidentType,
          parkingInfo,
          shootingSpots,
          ipTransmissionInfo,
          fpuInfo,
          hazards,
          notes: notes.filter((n) => n.title.trim() || n.body.trim()),
        },
        profile.name
      );
      setConfirmOpen(false);
      setToast({ type: "success", message: "出動記録を更新しました" });
      setTimeout(() => router.push(`/dispatch/${params.id}`), 600);
    } catch (err) {
      console.error(err);
      setSubmitting(false);
      setToast({ type: "error", message: "更新に失敗しました" });
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

  const confirmSummary = [
    { label: "場所名", value: locationName },
    { label: "住所", value: address },
    { label: "出動内容", value: incidentType },
    { label: "駐車場所", value: parkingInfo },
    { label: "撮影ポイント", value: shootingSpots },
    { label: "携帯回線(IP伝送)の状況", value: ipTransmissionInfo },
    { label: "FPU伝送の状況", value: fpuInfo },
    { label: "危険箇所・注意事項", value: hazards },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <ConfirmDialog
        open={confirmOpen}
        title="この内容で更新しますか?"
        summary={confirmSummary}
        confirmLabel="更新する"
        submitting={submitting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmedSubmit}
      />
      <PageHeader
        title={`${record.locationName} を編集`}
        backHref={`/dispatch/${params.id}`}
        backLabel="詳細に戻る"
      />

      <form onSubmit={handleOpenConfirm} className="max-w-2xl mx-auto p-5 sm:p-10 space-y-6 pb-28">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-3">
          誰でも編集できますが、変更内容は履歴として記録されます(誰が・いつ・何を変えたか)。
          GPSチェックポイント・軌跡・機材・写真はこの画面では編集できません。
        </div>

        <section className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">出動内容</label>
            <input
              value={incidentType}
              onChange={(e) => setIncidentType(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              場所名<span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              required
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">住所</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputClass}
            />
            {addressLoading && (
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <Spinner /> 住所を取得中...
              </p>
            )}
          </div>
          <div>
            <LocationPicker value={position} onChange={handlePositionChange} />
            {position && (
              <p className="text-xs text-gray-500 mt-1">
                緯度: {position.lat.toFixed(5)} / 経度: {position.lng.toFixed(5)}
              </p>
            )}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 space-y-4">
          <h2 className="font-semibold text-gray-900">現場情報</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">駐車場所</label>
            <textarea
              value={parkingInfo}
              onChange={(e) => setParkingInfo(e.target.value)}
              className={inputClass}
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">撮影ポイント</label>
            <textarea
              value={shootingSpots}
              onChange={(e) => setShootingSpots(e.target.value)}
              className={inputClass}
              rows={2}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              携帯回線(IP伝送)の状況
            </label>
            <textarea
              value={ipTransmissionInfo}
              onChange={(e) => setIpTransmissionInfo(e.target.value)}
              className={inputClass}
              rows={2}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">FPU伝送の状況</label>
            <textarea
              value={fpuInfo}
              onChange={(e) => setFpuInfo(e.target.value)}
              className={inputClass}
              rows={2}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              危険箇所・注意事項
            </label>
            <textarea
              value={hazards}
              onChange={(e) => setHazards(e.target.value)}
              className={inputClass}
              rows={2}
            />
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">記録メモ</h2>
            <button
              type="button"
              onClick={addNoteEntry}
              className="flex-shrink-0 text-sm font-medium text-blue-600 border border-blue-200 bg-blue-50 rounded-lg w-8 h-8 flex items-center justify-center hover:bg-blue-100 hover:border-blue-300 transition-all duration-150"
              aria-label="記録メモを追加"
            >
              ＋
            </button>
          </div>
          <div className="space-y-3">
            {notes.map((note, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-4 space-y-2 relative">
                {notes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeNoteEntry(i)}
                    className="absolute top-2 right-2 text-xs text-gray-400 hover:text-red-500"
                  >
                    削除
                  </button>
                )}
                <input
                  value={note.title}
                  onChange={(e) => updateNoteEntry(i, "title", e.target.value)}
                  placeholder="タイトル"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <textarea
                  value={note.body}
                  onChange={(e) => updateNoteEntry(i, "body", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                />
              </div>
            ))}
          </div>
        </section>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 sm:static sm:border-0 sm:p-0 sm:bg-transparent">
          <button
            type="submit"
            className="w-full max-w-2xl mx-auto flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-3 font-medium shadow-sm hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150"
          >
            内容を確認して更新する
          </button>
        </div>
      </form>
    </div>
  );
}
