"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Toast, { type ToastState } from "./Toast";

interface ExtractedData {
  locationName: string;
  address: string;
  incidentType: string;
  date: string;
  parkingInfo: string;
  shootingSpots: string;
  ipTransmissionInfo: string;
  fpuInfo: string;
  hazards: string;
  notes: string;
}

interface DuplicateWarning {
  isDuplicate: boolean;
  recordId?: string;
  locationName?: string;
  date?: string;
}

interface Props {
  extractedData: ExtractedData;
  fileHash: string;
  organizationId: string;
  category: string;
  recordedBy: string;
  onReset: () => void;
}

export default function DispatchImportPreview({
  extractedData,
  fileHash,
  organizationId,
  category,
  recordedBy,
  onReset,
}: Props) {
  const router = useRouter();
  const [editedData, setEditedData] = useState(extractedData);
  const [checking, setChecking] = useState(true);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateWarning>({
    isDuplicate: false,
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  // マウント時に現場＋日時の重複チェック
  useEffect(() => {
    checkDuplicateLocation();
  }, [editedData.locationName, editedData.date, organizationId]);

  async function checkDuplicateLocation() {
    try {
      const response = await fetch("/api/dispatch/import/check-location-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationName: editedData.locationName,
          date: editedData.date,
          organizationId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setDuplicateWarning(data);
      }
    } catch (error) {
      console.error("Duplicate check failed:", error);
    } finally {
      setChecking(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch("/api/dispatch/import/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extractedData: editedData,
          fileHash,
          organizationId,
          category,
          recordedBy,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "保存に失敗しました");
      }

      const result = await response.json();
      setToast({ type: "success", message: "出動記録を保存しました" });

      setTimeout(() => {
        router.push(`/dispatch/${result.recordId}`);
      }, 1000);
    } catch (error) {
      console.error("Save failed:", error);
      // TypeError（Safari の Load failed 含む）はユーザーフレンドリーなメッセージに変換
      const isNetworkError =
        error instanceof TypeError ||
        (error instanceof Error &&
          (error.message.includes("Load failed") ||
            error.message.includes("Failed to fetch") ||
            error.message.includes("NetworkError")));
      setToast({
        type: "error",
        message: isNetworkError
          ? "通信エラーが発生しました。接続を確認して再度お試しください"
          : error instanceof Error
            ? error.message
            : "保存に失敗しました",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* 重複警告 */}
      {!checking && duplicateWarning.isDuplicate && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm font-medium text-yellow-900 mb-1">
            ⚠️ 同じ現場・日時の記録が存在します
          </p>
          <p className="text-xs text-yellow-800">
            場所: {duplicateWarning.locationName} / 日時: {duplicateWarning.date}
            <br />
            既存の記録ID: {duplicateWarning.recordId}
            <br />
            確認した上で保存してください。
          </p>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-bold">解析結果の確認・編集</h2>

        {/* 基本情報 */}
        <div className="space-y-3 border-b border-gray-200 pb-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              場所名 <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={editedData.locationName}
              onChange={(e) =>
                setEditedData({ ...editedData, locationName: e.target.value })
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              住所
            </label>
            <input
              type="text"
              value={editedData.address}
              onChange={(e) =>
                setEditedData({ ...editedData, address: e.target.value })
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                出動内容
              </label>
              <input
                type="text"
                value={editedData.incidentType}
                onChange={(e) =>
                  setEditedData({ ...editedData, incidentType: e.target.value })
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                日時
              </label>
              <input
                type="datetime-local"
                value={editedData.date}
                onChange={(e) =>
                  setEditedData({ ...editedData, date: e.target.value })
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        {/* 詳細情報 */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              駐車場所
            </label>
            <textarea
              value={editedData.parkingInfo}
              onChange={(e) =>
                setEditedData({ ...editedData, parkingInfo: e.target.value })
              }
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              撮影ポイント
            </label>
            <textarea
              value={editedData.shootingSpots}
              onChange={(e) =>
                setEditedData({ ...editedData, shootingSpots: e.target.value })
              }
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                携帯回線（IP伝送）
              </label>
              <textarea
                value={editedData.ipTransmissionInfo}
                onChange={(e) =>
                  setEditedData({
                    ...editedData,
                    ipTransmissionInfo: e.target.value,
                  })
                }
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                FPU伝送
              </label>
              <textarea
                value={editedData.fpuInfo}
                onChange={(e) =>
                  setEditedData({ ...editedData, fpuInfo: e.target.value })
                }
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              危険箇所・注意事項
            </label>
            <textarea
              value={editedData.hazards}
              onChange={(e) =>
                setEditedData({ ...editedData, hazards: e.target.value })
              }
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              その他のメモ
            </label>
            <textarea
              value={editedData.notes}
              onChange={(e) =>
                setEditedData({ ...editedData, notes: e.target.value })
              }
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {/* ボタン */}
      <div className="flex gap-3">
        <button
          onClick={onReset}
          className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 transition-colors font-medium"
        >
          キャンセル
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {saving ? "保存中..." : "出動記録として保存"}
        </button>
      </div>
    </div>
  );
}
