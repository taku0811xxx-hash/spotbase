"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  getDispatchRecords,
  completeDispatchRecord,
  deleteDispatchRecord,
  type DispatchRecord,
} from "@/lib/dispatchRecords";
import PageHeader from "@/components/PageHeader";
import ConfirmDialog from "@/components/ConfirmDialog";

const DEFAULT_STATUS_CONFIG = {
  bg: "bg-gray-100",
  text: "text-gray-700",
  label: "不明",
};

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  準備中: { bg: "bg-gray-100", text: "text-gray-700", label: "準備中" },
  移動中: { bg: "bg-blue-100", text: "text-blue-700", label: "移動中" },
  現場対応中: { bg: "bg-red-100", text: "text-red-700", label: "現場対応中" },
  完了: { bg: "bg-green-100", text: "text-green-700", label: "完了" },
};


export default function ActiveDispatchPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [records, setRecords] = useState<DispatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  // 「対応完了」処理中の出動記録ID(ボタンの二重押し防止用)
  const [completingId, setCompletingId] = useState<string | null>(null);
  // 削除確認ダイアログの対象(nullなら非表示)
  const [deleteTarget, setDeleteTarget] = useState<DispatchRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (!profile) return;

    // Get all dispatch records and filter for active ones
    getDispatchRecords({
      organizationId: profile.organizationId,
      category: profile.category,
      isAdmin: profile.accessLevel === "admin",
    })
      .then((allRecords) => {
        // Filter for active records (status that's not 完了)
        const activeRecords = allRecords.filter(
          (r) => r.status && r.status !== "完了"
        );
        setRecords(activeRecords);
      })
      .catch((error) => console.error("Error loading dispatch records:", error))
      .finally(() => setLoading(false));
  }, [authLoading, user, profile, router]);

  // 「対応完了」ボタン: 出動ステータスを完了にし、出動記録データとして蓄積・保存する。
  // 既存の入力内容(タイトル・概要・住所等)はそのまま保持し、statusとcompletedAtのみ更新する。
  async function handleComplete(record: DispatchRecord) {
    if (completingId) return;
    setCompletingId(record.id);
    try {
      await completeDispatchRecord(record.id, {
        title: record.title,
        summary: record.summary,
        address: record.address,
        incidentType: record.incidentType,
        dispatcherName: record.dispatcherName,
        siteManagerName: record.siteManagerName,
        newsUrl: record.newsUrl,
        newsSummary: record.newsSummary,
      });
      // 完了扱いになった記録は「出動中」一覧から即座に取り除く
      setRecords((prev) => prev.filter((r) => r.id !== record.id));
    } catch (error) {
      console.error("対応完了の保存に失敗しました:", error);
    } finally {
      setCompletingId(null);
    }
  }

  // 「削除」ボタン: 確認ダイアログを経て、出動記録データを削除する。
  async function handleConfirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteDispatchRecord(deleteTarget.id);
      setRecords((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      console.error("出動記録の削除に失敗しました:", error);
    } finally {
      setDeleting(false);
    }
  }

  const getElapsedTime = (createdAt: any) => {
    if (!createdAt) return "---";
    const created = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}時間${minutes % 60}分`;
    return `${minutes}分`;
  };

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100 text-sm text-gray-500">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <PageHeader title="🚨 現在出動中" />

      <div className="flex-1 flex flex-col max-w-4xl w-full mx-auto p-4 sm:p-6 gap-4 sm:gap-6">
        {loading ? (
          <p className="text-sm text-gray-500">読み込み中...</p>
        ) : records.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-lg font-semibold text-gray-900 mb-2">対応中の案件はありません</p>
            <p className="text-sm text-gray-600 mb-4">すべての案件が完了しました</p>
            <Link
              href="/dispatch"
              className="text-blue-600 hover:underline text-sm font-medium"
            >
              ← 出動記録一覧に戻る
            </Link>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                    対応中の案件: {records.length}件
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">
                    リアルタイムで案件ステータスと現場メモを管理できます
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {records.map((record) => {
                  const currentStatus = record.status || "準備中";
                  const statusConfig = statusColors[currentStatus] || DEFAULT_STATUS_CONFIG;
                  const elapsedTime = getElapsedTime(record.createdAt);

                  return (
                    <div
                      key={record.id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      {/* Header Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{record.incidentType}</h3>
                          <p className="text-sm text-gray-600 mt-1">
                            📍 {record.locationName} ({record.address})
                          </p>
                        </div>
                        <div className={`px-3 py-1.5 rounded-lg font-medium text-sm whitespace-nowrap ${statusConfig.bg} ${statusConfig.text}`}>
                          {statusConfig.label}
                        </div>
                      </div>

                      {/* Details Row */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs sm:text-sm">
                        <div className="bg-gray-50 rounded p-2">
                          <p className="text-gray-600">クルー</p>
                          <p className="font-semibold text-gray-900">{record.createdBy || "---"}</p>
                        </div>
                        <div className="bg-gray-50 rounded p-2">
                          <p className="text-gray-600">経過時間</p>
                          <p className="font-semibold text-gray-900">{elapsedTime}</p>
                        </div>
                        <div className="bg-gray-50 rounded p-2">
                          <p className="text-gray-600">想定終了</p>
                          <p className="font-semibold text-gray-900">---</p>
                        </div>
                        <div className="bg-gray-50 rounded p-2">
                          <p className="text-gray-600">機材</p>
                          <p className="font-semibold text-gray-900">確認中</p>
                        </div>
                      </div>

                      {/* Live Link */}
                      <div className="mt-3 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
                        <Link
                          href={`/dispatch/${record.id}/live`}
                          className="text-red-600 hover:underline text-xs sm:text-sm font-medium"
                        >
                          ライブ画面(GPS+チャット) →
                        </Link>

                        {/* 対応完了・削除の操作ボタン */}
                        <div className="flex items-center gap-2 ml-auto sm:ml-0">
                          <button
                            onClick={() => handleComplete(record)}
                            disabled={completingId === record.id}
                            className="px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                          >
                            {completingId === record.id ? "保存中..." : "対応完了"}
                          </button>
                          <button
                            onClick={() => setDeleteTarget(record)}
                            className="px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 削除確認ダイアログ - 地図等より確実に前面に表示するためPortalでbody直下に描画(z-[9999]) */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="この出動記録を削除しますか?"
        summary={
          deleteTarget
            ? [
                { label: "現場名", value: deleteTarget.locationName },
                { label: "住所", value: deleteTarget.address },
                { label: "出動内容", value: deleteTarget.incidentType },
              ]
            : []
        }
        confirmLabel="削除する"
        submitting={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
