"use client";

// 「ここトレ！」自分メモの確認モーダル: 打刻前に現在地(住所)・時刻を確認し、任意で写真を1枚添えて登録する。
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, X } from "lucide-react";
import { parseExif } from "@/lib/exifParser";
import { reverseGeocode } from "@/lib/geocode";
import { getCurrentPosition, QUICK_MEMO_LABEL, saveQuickMemo, type QuickMemoType } from "@/lib/quickMemos";

export default function QuickMemoModal({
  type,
  onClose,
  onSaved,
}: {
  type: QuickMemoType;
  onClose: () => void;
  onSaved: (linkedSpotId: string | null) => void;
}) {
  type Pos = { lat: number; lng: number };
  const [mode, setMode] = useState<"gps" | "photo">("gps");
  const [gpsPos, setGpsPos] = useState<Pos | null>(null);
  const [exifPos, setExifPos] = useState<Pos | null>(null);
  const [exifState, setExifState] = useState<"idle" | "checking" | "found" | "none">("idle");
  const [address, setAddress] = useState("");
  const pos = mode === "gps" ? gpsPos : exifPos;
  const [now] = useState(() => new Date());
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (mode !== "gps") return;
    let cancelled = false;
    setError("");
    getCurrentPosition()
      .then((p) => !cancelled && setGpsPos(p))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "現在地を取得できませんでした"));
    return () => {
      cancelled = true;
    };
  }, [attempt, mode]);

  // 採用する位置が決まったら住所を逆引きして表示する
  useEffect(() => {
    if (!pos) return setAddress("");
    let cancelled = false;
    setAddress("");
    reverseGeocode(pos.lat, pos.lng)
      .catch(() => null)
      .then((a) => !cancelled && setAddress(a ?? "住所を取得できませんでした"));
    return () => {
      cancelled = true;
    };
  }, [pos?.lat, pos?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // 写真の位置情報モード: 選んだ写真のEXIF GPSから位置を取り出す
  async function readExif(f: File) {
    setExifState("checking");
    try {
      const { position } = await parseExif(f);
      setExifPos(position ?? null);
      setExifState(position ? "found" : "none");
    } catch {
      setExifState("none");
    }
  }

  async function onPickPhoto(f: File | null) {
    setPhoto(f);
    setExifPos(null);
    setExifState("idle");
    if (f && mode === "photo") await readExif(f);
  }

  function switchMode(m: "gps" | "photo") {
    setMode(m);
    setError("");
    setExifPos(null);
    setExifState("idle");
    if (m === "photo" && photo) void readExif(photo);
  }

  async function submit() {
    if (!pos) return;
    setSaving(true);
    setError("");
    try {
      const { linkedSpotId } = await saveQuickMemo(type, pos, photo);
      onSaved(linkedSpotId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
      setSaving(false);
    }
  }

  if (typeof document === "undefined") return null;
  // ヘッダー/ボトムナビ(z-[9999])やLeafletより前面に出すため、body直下へポータルで描画する
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/40 p-3" onClick={saving ? undefined : onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2">
          <h2 className="text-base font-bold text-gray-800 flex-1">{QUICK_MEMO_LABEL[type]}を保存しますか？</h2>
          <button onClick={onClose} disabled={saving} aria-label="閉じる" className="text-gray-400">
            <X size={18} />
          </button>
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {([["gps", "📍 現在地から登録"], ["photo", "📸 写真の位置情報から登録"]] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              disabled={saving}
              className={`flex-1 py-2 ${mode === m ? "bg-blue-600 text-white font-semibold" : "bg-white text-gray-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-sm text-gray-700 bg-gray-50 rounded-lg p-2 space-y-0.5">
          {mode === "gps" ? (
            <p>📍 {pos ? address || "住所を取得中..." : error || "現在地を取得中..."}</p>
          ) : exifState === "found" ? (
            <p>📸 写真の撮影場所({address ? `${address}付近` : "住所を取得中..."})を取得しました</p>
          ) : exifState === "checking" ? (
            <p>📸 写真の位置情報を確認中...</p>
          ) : exifState === "none" ? (
            <div className="space-y-1">
              <p>写真に位置情報が含まれていません。現在地から登録するか、位置情報つきの写真を選び直してください。</p>
              <button onClick={() => switchMode("gps")} className="text-xs text-blue-600 underline">
                現在地から登録する
              </button>
            </div>
          ) : (
            <p>📸 下の写真(看板・外観など)を選ぶと、撮影場所を取得します</p>
          )}
          {mode === "gps" && !pos && error && (
            <button onClick={() => setAttempt((n) => n + 1)} className="text-xs text-blue-600 underline">
              再取得する
            </button>
          )}
          <p className="text-xs text-gray-500">🕒 {now.toLocaleString("ja-JP")}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">写真(任意・料金表や看板など)</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onPickPhoto(e.target.files?.[0] ?? null)}
          />
          {preview ? (
            <div className="relative w-24 h-24">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="添付写真" className="w-24 h-24 rounded-lg object-cover" />
              <button
                onClick={() => {
                  void onPickPhoto(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                aria-label="写真を外す"
                className="absolute -top-2 -right-2 bg-gray-700 text-white rounded-full p-0.5"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs text-gray-600 border border-dashed border-gray-300 rounded-lg px-3 py-3"
            >
              <Camera size={16} /> 撮影 / ライブラリから選択
            </button>
          )}
        </div>
        {error && pos && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} disabled={saving} className="flex-1 py-2 text-sm rounded-lg border border-gray-200 text-gray-600">
            キャンセル
          </button>
          <button
            onClick={submit}
            disabled={!pos || saving}
            className="flex-1 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white disabled:opacity-50"
          >
            {saving ? "保存中..." : "登録する"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
