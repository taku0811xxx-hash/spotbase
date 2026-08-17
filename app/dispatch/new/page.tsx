"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  createDispatchRecord,
  type Checkpoint,
  type TrackPoint,
  type NoteEntry,
} from "@/lib/dispatchRecords";
import { useAuth } from "@/components/AuthProvider";
import { parseCsv } from "@/lib/csv";
import { geocodeQuery } from "@/lib/geocode";
import PageHeader from "@/components/PageHeader";
import GpsCheckpointRecorder from "@/components/GpsCheckpointRecorder";
import Toast, { type ToastState } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";

// LeafletはSSR非対応なのでクライアント側のみで読み込む
const LocationPicker = dynamic(() => import("@/components/LocationPicker"), {
  ssr: false,
});

type PhotoEntry = { id: string; file: File; caption: string; previewUrl: string };

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  );
}

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `id-${idCounter}`;
}

export default function NewDispatchPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [responderName, setResponderName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [locationSearching, setLocationSearching] = useState(false);
  const [incidentType, setIncidentType] = useState("");
  const [notes, setNotes] = useState<NoteEntry[]>([{ title: "", body: "" }]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [track, setTrack] = useState<TrackPoint[]>([]);
  const [equipmentHeaders, setEquipmentHeaders] = useState<string[]>([]);
  const [equipmentRows, setEquipmentRows] = useState<string[][]>([]);
  const [photoEntries, setPhotoEntries] = useState<PhotoEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ログイン名を出動者名の初期値として入れておく(編集可能)
  useEffect(() => {
    if (profile) setResponderName(profile.name);
  }, [profile]);

  const positionLockedRef = useRef(false);

  // 場所名を入力すると、位置が手動で決まっていない場合に限り自動で地図にピンを立てる
  useEffect(() => {
    if (positionLockedRef.current) return;
    const trimmed = locationName.trim();
    if (!trimmed) return;

    const timer = setTimeout(async () => {
      setLocationSearching(true);
      try {
        const results = await geocodeQuery(trimmed);
        if (positionLockedRef.current) return;
        if (results.length > 0) {
          setPosition({ lat: results[0].lat, lng: results[0].lng });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLocationSearching(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [locationName]);

  function handlePositionChange(pos: { lat: number; lng: number }) {
    positionLockedRef.current = true;
    setPosition(pos);
  }

  function handleEquipmentFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(reader.result as string);
      if (parsed.length === 0) {
        setToast({ type: "error", message: "機材表を読み取れませんでした" });
        return;
      }
      setEquipmentHeaders(parsed[0]);
      setEquipmentRows(parsed.slice(1));
    };
    reader.onerror = () => {
      setToast({ type: "error", message: "ファイルの読み込みに失敗しました" });
    };
    reader.readAsText(file, "utf-8");
  }

  function handleClearEquipment() {
    setEquipmentHeaders([]);
    setEquipmentRows([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // 記録メモ: +ボタンでタイトル+本文のエントリーを追加
  function addNoteEntry() {
    setNotes((prev) => [...prev, { title: "", body: "" }]);
  }
  function updateNoteEntry(index: number, field: "title" | "body", value: string) {
    setNotes((prev) => prev.map((n, i) => (i === index ? { ...n, [field]: value } : n)));
  }
  function removeNoteEntry(index: number) {
    setNotes((prev) => prev.filter((_, i) => i !== index));
  }

  // 現場写真: 選択した各ファイルにキャプション入力欄が付く
  function handlePhotoFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const newEntries: PhotoEntry[] = files.map((file) => ({
      id: nextId(),
      file,
      caption: "",
      previewUrl: URL.createObjectURL(file),
    }));
    setPhotoEntries((prev) => [...prev, ...newEntries]);
    e.target.value = "";
  }
  function updatePhotoCaption(id: string, caption: string) {
    setPhotoEntries((prev) => prev.map((p) => (p.id === id ? { ...p, caption } : p)));
  }
  function removePhotoEntry(id: string) {
    setPhotoEntries((prev) => prev.filter((p) => p.id !== id));
  }

  function handleOpenConfirm(e: React.FormEvent) {
    e.preventDefault();
    setConfirmOpen(true);
  }

  async function handleConfirmedSubmit() {
    if (!responderName.trim()) {
      setToast({ type: "error", message: "出動者名を入力してください" });
      return;
    }
    if (!profile) {
      setToast({ type: "error", message: "ログインしてください" });
      return;
    }
    setSubmitting(true);
    try {
      const id = await createDispatchRecord({
        locationName,
        lat: position?.lat ?? null,
        lng: position?.lng ?? null,
        incidentType,
        checkpoints,
        track,
        equipmentHeaders,
        equipmentRows,
        notes: notes.filter((n) => n.title.trim() || n.body.trim()),
        photos: photoEntries.map((p) => ({ file: p.file, caption: p.caption })),
        organizationId: profile.organizationId,
        category: profile.category,
        recordedBy: responderName,
      });
      setConfirmOpen(false);
      setToast({ type: "success", message: "出動記録を保存しました" });
      setTimeout(() => router.push(`/dispatch/${id}`), 600);
    } catch (err) {
      console.error(err);
      setSubmitting(false);
      setToast({ type: "error", message: "保存に失敗しました" });
    }
  }

  const confirmSummary = [
    { label: "出動者", value: responderName },
    { label: "場所名", value: locationName },
    { label: "出動内容", value: incidentType },
    {
      label: "記録メモ",
      value: notes.filter((n) => n.title.trim() || n.body.trim()).length > 0
        ? `${notes.filter((n) => n.title.trim() || n.body.trim()).length}件`
        : "未入力",
    },
    { label: "チェックポイント", value: `${checkpoints.length}件` },
    { label: "リアルタイム記録", value: `${track.length}件のポイント` },
    { label: "機材", value: equipmentRows.length > 0 ? `${equipmentRows.length}件` : "未登録" },
    { label: "現場写真", value: photoEntries.length > 0 ? `${photoEntries.length}枚` : "未登録" },
  ];

  const inputClass =
    "w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  return (
    <div className="min-h-screen bg-gray-50">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <ConfirmDialog
        open={confirmOpen}
        title="この内容で出動記録を保存しますか?"
        summary={confirmSummary}
        confirmLabel="保存する"
        submitting={submitting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmedSubmit}
      />
      <PageHeader title="出動記録" backHref="/dispatch" backLabel="一覧に戻る" />

      <form onSubmit={handleOpenConfirm} className="max-w-2xl mx-auto p-5 sm:p-10 space-y-6 pb-28">
        <section className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              出動者名<span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              required
              value={responderName}
              onChange={(e) => setResponderName(e.target.value)}
              placeholder="例: 林拓海"
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
              placeholder="例: ○○駅前(入力すると地図に自動でピンが立ちます)"
              className={inputClass}
            />
            {locationSearching && (
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <Spinner /> 場所を検索中...
              </p>
            )}
          </div>
          <div>
            <LocationPicker value={position} onChange={handlePositionChange} />
            {position ? (
              <p className="text-xs text-gray-500 mt-1">
                緯度: {position.lat.toFixed(5)} / 経度: {position.lng.toFixed(5)}
              </p>
            ) : (
              <p className="text-xs text-amber-600 mt-1">
                場所名を入力するか、地図をクリックして位置を指定できます
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              出動内容(事件・事故など)
            </label>
            <input
              value={incidentType}
              onChange={(e) => setIncidentType(e.target.value)}
              placeholder="例: 交通事故の取材"
              className={inputClass}
            />
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8">
          <GpsCheckpointRecorder
            checkpoints={checkpoints}
            onCheckpointsChange={setCheckpoints}
            track={track}
            onTrackChange={setTrack}
          />
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">記録メモ</h2>
              <p className="text-xs text-gray-500 mt-1">
                気づいたこと、次回この現場に行く人への注意点などを書いてください
              </p>
            </div>
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
                  placeholder="タイトル(例: 駐車について)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <textarea
                  value={note.body}
                  onChange={(e) => updateNoteEntry(i, "body", e.target.value)}
                  placeholder="例: 現場周辺は駐車スペースが少なく、早めの到着が望ましい"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 space-y-3">
          <div>
            <h2 className="font-semibold text-gray-900">持ち出す機材</h2>
            <p className="text-xs text-gray-500 mt-1">
              CSV形式の機材表をアップロードすると、この出動記録に紐づけて保存されます。
              Excelの場合は「CSV形式で保存」してからアップロードしてください。
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleEquipmentFile}
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:text-sm file:font-medium hover:file:bg-blue-100"
          />
          {equipmentHeaders.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleClearEquipment}
                className="text-xs text-gray-500 hover:underline"
              >
                クリア
              </button>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      {equipmentHeaders.map((h, i) => (
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
                    {equipmentRows.map((row, ri) => (
                      <tr key={ri} className="hover:bg-gray-50">
                        {equipmentHeaders.map((_, ci) => (
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
            </>
          )}
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 space-y-3">
          <div>
            <h2 className="font-semibold text-gray-900">現場写真</h2>
            <p className="text-xs text-gray-500 mt-1">
              現場の様子や証拠となる写真を複数枚アップロードできます。それぞれにキャプションを付けられます。
            </p>
          </div>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotoFiles}
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:text-sm file:font-medium hover:file:bg-blue-100"
          />
          {photoEntries.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {photoEntries.map((p) => (
                <div key={p.id} className="border border-gray-200 rounded-lg p-2 flex gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.previewUrl}
                    alt=""
                    className="w-16 h-16 object-cover rounded flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <input
                      value={p.caption}
                      onChange={(e) => updatePhotoCaption(p.id, e.target.value)}
                      placeholder="キャプション(例: 現場入口の様子)"
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => removePhotoEntry(p.id)}
                      className="text-[11px] text-gray-400 hover:text-red-500"
                    >
                      削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 sm:static sm:border-0 sm:p-0 sm:bg-transparent">
          <button
            type="submit"
            className="w-full max-w-2xl mx-auto flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-3 font-medium shadow-sm hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150"
          >
            内容を確認して保存する
          </button>
        </div>
      </form>
    </div>
  );
}
