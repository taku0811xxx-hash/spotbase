"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createDispatchRecord,
  type Checkpoint,
  type TrackPoint,
  type NoteEntry,
} from "@/lib/dispatchRecords";
import { useAuth } from "@/components/AuthProvider";
import { parseCsv } from "@/lib/csv";
import { geocodeQuery, reverseGeocode } from "@/lib/geocode";
import { syncPinFromDispatch } from "@/lib/pinSync";
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

const inputClass =
  "w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

function NewDispatchForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const [responderName, setResponderName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [address, setAddress] = useState("");
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [locationSearching, setLocationSearching] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [parkingGpsLoading, setParkingGpsLoading] = useState(false);
  const [incidentType, setIncidentType] = useState("");
  const [parkingInfo, setParkingInfo] = useState("");
  const [shootingSpots, setShootingSpots] = useState("");
  const [ipTransmissionInfo, setIpTransmissionInfo] = useState("");
  const [fpuInfo, setFpuInfo] = useState("");
  const [hazards, setHazards] = useState("");
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

  // 地図・検索結果から「ここで出動記録を作成する」で来た場合、
  // 場所名・位置をあらかじめ入力しておく
  useEffect(() => {
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const name = searchParams.get("locationName");
    if (lat && lng) {
      positionLockedRef.current = true;
      setPosition({ lat: parseFloat(lat), lng: parseFloat(lng) });
    }
    if (name) setAddress(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 場所名を入力すると、位置が手動で決まっていない場合に限り自動で地図にピンを立て、住所も入力する
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
          setAddress(results[0].displayName);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLocationSearching(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [locationName]);

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

  // 駐車場所欄: 現在地(GPS)の住所を取得して、駐車場所メモに挿入する
  function handleInsertCurrentLocationToParking() {
    if (!navigator.geolocation) {
      setToast({ type: "error", message: "この端末は位置情報の取得に対応していません" });
      return;
    }
    setParkingGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const found = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          const text =
            found ??
            `緯度${pos.coords.latitude.toFixed(5)} / 経度${pos.coords.longitude.toFixed(5)}`;
          setParkingInfo((prev) => (prev ? `${prev}\n現在地: ${text}` : `現在地: ${text}`));
        } catch (err) {
          console.error(err);
          setToast({ type: "error", message: "住所の取得に失敗しました" });
        } finally {
          setParkingGpsLoading(false);
        }
      },
      (err) => {
        console.error(err);
        setParkingGpsLoading(false);
        setToast({
          type: "error",
          message: "現在地を取得できませんでした。位置情報の許可を確認してください",
        });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
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
        address,
        lat: position?.lat ?? null,
        lng: position?.lng ?? null,
        incidentType,
        parkingInfo,
        shootingSpots,
        ipTransmissionInfo,
        fpuInfo,
        hazards,
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

      // 位置情報があれば、この場所の現場記録を裏側で自動生成・更新する
      // (画面遷移をブロックしないよう、結果を待たずに実行する)
      if (position) {
        syncPinFromDispatch(
          {
            locationName,
            address,
            lat: position.lat,
            lng: position.lng,
            organizationId: profile.organizationId,
            category: profile.category,
            recordedBy: responderName,
          },
          {
            organizationId: profile.organizationId,
            category: profile.category,
            isAdmin: profile.accessLevel === "admin",
          }
        ).catch((err) => console.error("現場記録の自動同期に失敗:", err));
      }

      setTimeout(() => router.push(`/dispatch/${id}`), 600);
    } catch (err) {
      console.error(err);
      setSubmitting(false);
      setToast({ type: "error", message: "保存に失敗しました" });
    }
  }

  const confirmSummary = [
    { label: "出動内容", value: incidentType },
    { label: "出動者", value: responderName },
    { label: "場所名", value: locationName },
    { label: "住所", value: address },
    { label: "駐車場所", value: parkingInfo },
    { label: "撮影ポイント", value: shootingSpots },
    { label: "携帯回線(IP伝送)の状況", value: ipTransmissionInfo },
    { label: "FPU伝送の状況", value: fpuInfo },
    { label: "危険箇所・注意事項", value: hazards },
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
              出動内容(事件・事故など)
            </label>
            <input
              value={incidentType}
              onChange={(e) => setIncidentType(e.target.value)}
              placeholder="例: 交通事故の取材"
              className={inputClass}
            />
          </div>
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">住所</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="場所名の入力や地図クリックで自動入力されます"
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
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 space-y-4">
          <h2 className="font-semibold text-gray-900">現場情報</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">駐車場所</label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleInsertCurrentLocationToParking}
                disabled={parkingGpsLoading}
                className="flex items-center gap-1.5 text-sm font-medium text-blue-600 border border-blue-200 bg-blue-50 rounded-lg px-3 py-1.5 hover:bg-blue-100 hover:border-blue-300 hover:shadow-sm active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
              >
                {parkingGpsLoading ? (
                  <Spinner className="w-4 h-4" />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                  </svg>
                )}
                {parkingGpsLoading ? "現在地を取得中..." : "現在地の住所を挿入"}
              </button>
              <textarea
                value={parkingInfo}
                onChange={(e) => setParkingInfo(e.target.value)}
                placeholder="例: 敷地内に3台分あり。満車時は近くのコインパーキングを利用。実際の駐車スペースにいる時は上のボタンで現在地を追加できます"
                className={inputClass}
                rows={3}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">撮影ポイント</label>
            <textarea
              value={shootingSpots}
              onChange={(e) => setShootingSpots(e.target.value)}
              placeholder="例: 正面玄関から見上げるアングルが撮りやすい"
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
              placeholder="例: 3キャリアボンディングで安定。屋内は不安定になりやすい"
              className={inputClass}
              rows={2}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">FPU伝送の状況</label>
            <textarea
              value={fpuInfo}
              onChange={(e) => setFpuInfo(e.target.value)}
              placeholder="例: ○○中継局への見通しあり。ビル影になる位置は不可"
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
              placeholder="例: 前面道路は交通量が多く、機材搬入時は要注意"
              className={inputClass}
              rows={2}
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

export default function NewDispatchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">
          読み込み中...
        </div>
      }
    >
      <NewDispatchForm />
    </Suspense>
  );
}
