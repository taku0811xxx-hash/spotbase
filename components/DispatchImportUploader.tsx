"use client";

import { useState, useRef } from "react";
import Toast, { type ToastState } from "./Toast";
import DispatchImportPreview from "./DispatchImportPreview";

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

interface Props {
  organizationId: string;
  category: string;
  recordedBy: string;
}

export default function DispatchImportUploader({
  organizationId,
  category,
  recordedBy,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  async function calculateFileHash(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // ファイルタイプチェック
    const allowedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "text/plain",
    ];
    if (!allowedTypes.includes(file.type)) {
      setToast({
        type: "error",
        message: "サポートされているファイル形式: PDF、PNG、JPG、TXT",
      });
      return;
    }

    // ファイルサイズチェック（10MB）
    if (file.size > 10 * 1024 * 1024) {
      setToast({ type: "error", message: "ファイルサイズは10MB以下にしてください" });
      return;
    }

    setUploading(true);
    try {
      // ファイルハッシュを計算
      const hash = await calculateFileHash(file);
      setFileHash(hash);

      // サーバーでハッシュ重複チェック
      const checkResponse = await fetch("/api/dispatch/import/check-hash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash }),
      });

      if (!checkResponse.ok) {
        throw new Error("ハッシュチェックに失敗しました");
      }

      const checkData = await checkResponse.json();
      if (checkData.isDuplicate) {
        setIsDuplicate(true);
        setDuplicateId(checkData.existingId);
        setToast({
          type: "error",
          message: `このファイルは過去にインポート済みです (記録ID: ${checkData.existingId})`,
        });
        setUploading(false);
        return;
      }

      // ファイルを Claude で解析
      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileType", file.type);

      const analyzeResponse = await fetch("/api/dispatch/import/analyze", {
        method: "POST",
        body: formData,
      });

      if (!analyzeResponse.ok) {
        const error = await analyzeResponse.json();
        throw new Error(error.error || "ファイル解析に失敗しました");
      }

      const data = await analyzeResponse.json();
      setExtractedData(data.extracted);
      setIsDuplicate(false);

      setToast({
        type: "success",
        message: "ファイルを解析しました。内容を確認してください。",
      });
    } catch (error) {
      console.error("Import failed:", error);
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
            : "ファイルのインポートに失敗しました",
      });
    } finally {
      setUploading(false);
    }
  }

  function handleReset() {
    setExtractedData(null);
    setFileHash(null);
    setIsDuplicate(false);
    setDuplicateId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  if (extractedData && fileHash && !isDuplicate) {
    return (
      <DispatchImportPreview
        extractedData={extractedData}
        fileHash={fileHash}
        organizationId={organizationId}
        category={category}
        recordedBy={recordedBy}
        onReset={handleReset}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-bold">ファイルをアップロード</h2>

        {isDuplicate && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm font-medium text-red-900 mb-2">
              ⚠️ 重複ファイル検出
            </p>
            <p className="text-sm text-red-800">
              このファイルは既にインポート済みです。
              <br />
              既存の記録ID: <code className="bg-white px-2 py-1 rounded">{duplicateId}</code>
            </p>
            <button
              onClick={handleReset}
              className="mt-3 text-sm text-red-600 hover:underline"
            >
              別のファイルを試す
            </button>
          </div>
        )}

        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 hover:bg-gray-50 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <p className="text-sm font-medium text-gray-700 mb-1">
            クリックしてファイルを選択、またはドラッグ&ドロップ
          </p>
          <p className="text-xs text-gray-500">
            対応形式: PDF、PNG、JPG、TXT（最大10MB）
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.txt"
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
          />
        </div>

        {uploading && (
          <div className="flex items-center justify-center p-4">
            <div className="animate-spin h-5 w-5 text-blue-600 mr-2"></div>
            <span className="text-sm text-gray-600">
              ファイルを解析中... これには数秒かかる場合があります
            </span>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
          <p className="font-medium mb-2">📋 使用方法</p>
          <ol className="space-y-1 text-xs">
            <li>1. 過去の報告書ファイルを選択</li>
            <li>2. Claude AIが自動的に内容を解析</li>
            <li>3. 解析結果を確認・編集</li>
            <li>4. 出動記録として保存</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
