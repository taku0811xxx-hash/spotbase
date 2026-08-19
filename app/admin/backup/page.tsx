"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import PageHeader from "@/components/PageHeader";
import Toast, { type ToastState } from "@/components/Toast";

export default function BackupPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  // 管理者チェック
  if (profile && profile.accessLevel !== "admin") {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="アクセス拒否" />
        <div className="max-w-2xl mx-auto p-4">
          <p className="text-sm text-red-600">
            このページは管理者のみアクセス可能です。
          </p>
        </div>
      </div>
    );
  }

  async function handleBackup() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/backup");
      if (!response.ok) {
        throw new Error("バックアップに失敗しました");
      }

      // JSONファイルをダウンロード
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const date = new Date();
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      link.download = `firestore-backup-${dateStr}.json`;
      link.click();
      URL.revokeObjectURL(url);

      setToast({ type: "success", message: "バックアップをダウンロードしました" });
    } catch (error) {
      console.error("Backup failed:", error);
      setToast({ type: "error", message: "バックアップに失敗しました" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Firestore バックアップ" />
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* 説明セクション */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-bold mb-4">バックアップについて</h2>
          <div className="space-y-3 text-sm text-gray-600">
            <p>
              このページでは、Firestore データベース全体をJSON形式でバックアップしてダウンロードできます。
            </p>
            <p>
              ✓
              すべてのコレクション（ユーザー、出動記録、現場情報など）が含まれます
            </p>
            <p>✓ タイムスタンプはISO 8601形式に変換されます</p>
            <p>✓ 大規模なデータセットの場合、ダウンロードに時間がかかる場合があります</p>
            <p>
              ⚠️
              ダウンロードされたファイルには機密情報が含まれる可能性があります。安全に保管してください。
            </p>
          </div>
        </div>

        {/* バックアップボタン */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-bold mb-4">今すぐバックアップ</h2>
          <button
            onClick={handleBackup}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {loading ? "バックアップ中..." : "バックアップファイルをダウンロード"}
          </button>
          <p className="text-xs text-gray-500 mt-3">
            ファイル名: firestore-backup-YYYY-MM-DD.json
          </p>
        </div>

        {/* 定期バックアップの推奨 */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
          <h3 className="font-bold text-amber-900 mb-2">💡 推奨事項</h3>
          <ul className="text-sm text-amber-800 space-y-2">
            <li>
              • 定期的に（例：週1回）バックアップを実行してください
            </li>
            <li>
              • バックアップファイルは複数の場所に保管することをお勧めします
            </li>
            <li>
              • CLIスクリプト
              <code className="bg-white px-2 py-1 rounded mx-1">
                npm run backup
              </code>
              で自動化することもできます
            </li>
          </ul>
        </div>

        {/* 復元方法（情報のみ） */}
        <div className="bg-gray-100 rounded-lg p-6 text-sm text-gray-600">
          <h3 className="font-bold text-gray-900 mb-2">復元方法</h3>
          <p>
            データ復元が必要な場合は、管理者にお問い合わせください。
            バックアップファイルから復元する際は、Firebase Consoleまたはカスタム復元スクリプトが必要です。
          </p>
        </div>
      </div>
    </div>
  );
}
