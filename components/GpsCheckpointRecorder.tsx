"use client";

import { useRef, useState } from "react";
import type { Checkpoint, TrackPoint } from "@/lib/dispatchRecords";

type Props = {
  checkpoints: Checkpoint[];
  onCheckpointsChange: (checkpoints: Checkpoint[]) => void;
  track: TrackPoint[];
  onTrackChange: (track: TrackPoint[]) => void;
};

const PRESET_COMMENTS = ["局発", "現場着", "撤収"];

// リアルタイム記録で保存する間隔(これより短い間隔の更新は間引く)
const MIN_TRACK_INTERVAL_MS = 10000;

export default function GpsCheckpointRecorder({
  checkpoints,
  onCheckpointsChange,
  track,
  onTrackChange,
}: Props) {
  const [comment, setComment] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState("");
  const [tracking, setTracking] = useState(false);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastTrackTimeRef = useRef<number>(0);

  function captureCheckpoint(commentText: string) {
    if (!navigator.geolocation) {
      setError("この端末は位置情報の取得に対応していません");
      return;
    }
    setCapturing(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const cp: Checkpoint = {
          time: new Date().toISOString(),
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          comment: commentText || "GPS記録",
        };
        onCheckpointsChange([...checkpoints, cp]);
        setComment("");
        setCapturing(false);
      },
      (err) => {
        console.error(err);
        setError("現在地を取得できませんでした。位置情報の許可を確認してください");
        setCapturing(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function removeCheckpoint(index: number) {
    onCheckpointsChange(checkpoints.filter((_, i) => i !== index));
  }

  function startTracking() {
    if (!navigator.geolocation) {
      setError("この端末は位置情報の取得に対応していません");
      return;
    }
    setTracking(true);
    setError("");
    lastTrackTimeRef.current = 0;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        setCurrentPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        // 間隔が短すぎる更新は間引いて、記録件数が膨らみすぎないようにする
        if (now - lastTrackTimeRef.current < MIN_TRACK_INTERVAL_MS) return;
        lastTrackTimeRef.current = now;
        onTrackChange([
          ...track,
          {
            time: new Date().toISOString(),
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          },
        ]);
      },
      (err) => {
        console.error(err);
        setError("リアルタイム記録中に位置情報の取得エラーが発生しました");
      },
      { enableHighAccuracy: true }
    );
  }

  function stopTracking() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
  }

  return (
    <div className="space-y-4">
      {/* リアルタイム軌跡記録 */}
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">リアルタイム記録</p>
            <p className="text-xs text-gray-500">
              {tracking
                ? `記録中... (${track.length}件のポイント)`
                : `停止中 (${track.length}件のポイント)`}
            </p>
          </div>
          <button
            type="button"
            onClick={tracking ? stopTracking : startTracking}
            className={`text-sm font-medium rounded-lg px-4 py-2 transition-all duration-150 ${
              tracking
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {tracking ? "記録を停止" : "記録を開始"}
          </button>
        </div>
        {tracking && currentPos && (
          <p className="text-xs text-gray-500 mt-2">
            現在地: 緯度{currentPos.lat.toFixed(5)} / 経度{currentPos.lng.toFixed(5)}
            (精度: 約{Math.round(currentPos.accuracy)}m)
          </p>
        )}
        <p className="text-[11px] text-gray-400 mt-1">
          ※ 端末の位置情報を約10秒間隔で記録します。バッテリー消費に注意してください。ブラウザを閉じると停止します。
        </p>
      </div>

      {/* チェックポイント(時刻+GPS+コメント)記録 */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">チェックポイント記録</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {PRESET_COMMENTS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => captureCheckpoint(preset)}
              disabled={capturing}
              className="text-sm font-medium text-blue-600 border border-blue-200 bg-blue-50 rounded-lg px-3 py-1.5 hover:bg-blue-100 hover:border-blue-300 hover:shadow-sm active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
            >
              {preset}を記録
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="コメント(任意)"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="button"
            onClick={() => captureCheckpoint(comment)}
            disabled={capturing}
            className="bg-blue-600 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {capturing ? "取得中..." : "GPS送信"}
          </button>
        </div>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}

        {checkpoints.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {checkpoints.map((cp, i) => (
              <li
                key={i}
                className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-xs"
              >
                <div>
                  <span className="font-medium text-gray-800">{cp.comment}</span>
                  <span className="text-gray-500 ml-2">
                    {new Date(cp.time).toLocaleTimeString("ja-JP")}
                  </span>
                  <span className="text-gray-400 ml-2">
                    ({cp.lat.toFixed(5)}, {cp.lng.toFixed(5)})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeCheckpoint(i)}
                  className="text-red-500 hover:underline flex-shrink-0 ml-2"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
