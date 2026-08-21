"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { getDispatchRecords, type DispatchRecord } from "@/lib/dispatchRecords";
import PageHeader from "@/components/PageHeader";

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
  const [memoText, setMemoText] = useState<Record<string, string>>({});

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

  async function handleAddMemo(recordId: string) {
    if (!memoText[recordId]?.trim()) return;

    try {
      const record = records.find((r) => r.id === recordId);
      if (!record) return;

      const newMemo = {
        timestamp: new Date().toISOString(),
        text: memoText[recordId],
      };

      const existingMemos = record.memos || [];
      const docRef = doc(db, "dispatch_records", recordId);
      await updateDoc(docRef, {
        memos: [...existingMemos, newMemo],
      });

      setRecords((prev) =>
        prev.map((r) =>
          r.id === recordId
            ? {
                ...r,
                memos: [...(r.memos || []), newMemo],
              }
            : r
        )
      );

      setMemoText((prev) => ({ ...prev, [recordId]: "" }));
    } catch (error) {
      console.error("Error adding memo:", error);
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

                      {/* Memos Timeline */}
                      {record.memos && record.memos.length > 0 && (
                        <div className="mb-4 p-3 bg-gray-50 rounded-lg text-xs">
                          <p className="font-semibold text-gray-900 mb-2">現場メモ ({record.memos.length}件)</p>
                          <div className="space-y-2 max-h-[200px] overflow-y-auto">
                            {record.memos.map((memo: any, idx: number) => {
                              const memoTime = memo.timestamp
                                ? new Date(memo.timestamp).toLocaleTimeString("ja-JP", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "---";
                              return (
                                <div key={idx} className="flex gap-2 text-gray-700">
                                  <span className="text-gray-500 flex-shrink-0">[{memoTime}]</span>
                                  <span>{memo.text}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Add Memo Input */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="現場メモを入力（例: FPU回線確保、中継車設営完了）"
                          value={memoText[record.id] || ""}
                          onChange={(e) =>
                            setMemoText((prev) => ({
                              ...prev,
                              [record.id]: e.target.value,
                            }))
                          }
                          onKeyPress={(e) => {
                            if (e.key === "Enter") {
                              handleAddMemo(record.id);
                            }
                          }}
                          className="flex-1 px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => handleAddMemo(record.id)}
                          className="px-3 py-2 bg-gray-200 text-gray-700 text-xs sm:text-sm font-medium rounded-lg hover:bg-gray-300 transition-colors flex-shrink-0"
                        >
                          追加
                        </button>
                      </div>

                      {/* View Details Link */}
                      <div className="mt-3 text-right">
                        <Link
                          href={`/dispatch/${record.id}`}
                          className="text-blue-600 hover:underline text-xs sm:text-sm font-medium"
                        >
                          詳細を見る →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
