"use client";

import { type DispatchRecord } from "@/lib/dispatchRecords";

interface Props {
  recordedBy: string;
  records: DispatchRecord[];
  onClose: () => void;
}

export default function ActivityDetailsModal({ recordedBy, records, onClose }: Props) {
  // このユーザーの出動記録をフィルタリング
  const userRecords = records
    .filter((r) => r.recordedBy === recordedBy)
    .sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() ?? 0;
      const bTime = b.createdAt?.toMillis?.() ?? 0;
      return bTime - aTime; // 最新順
    });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* ヘッダー */}
        <div className="border-b border-gray-200 p-4 flex items-center justify-between bg-gray-50">
          <h2 className="text-lg font-bold">
            {recordedBy} の出動履歴（{userRecords.length}件）
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl font-bold"
          >
            ✕
          </button>
        </div>

        {/* コンテンツ */}
        <div className="overflow-y-auto flex-1 p-4">
          <div className="space-y-3">
            {userRecords.map((record) => {
              const date = record.createdAt?.toDate?.();
              const dateStr = date
                ? date.toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "不明";

              return (
                <div
                  key={record.id}
                  className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{record.locationName}</p>
                      <p className="text-sm text-gray-600">{record.address}</p>
                      <p className="text-xs text-gray-500 mt-1">{dateStr}</p>
                      {record.incidentType && (
                        <p className="text-sm text-gray-700 mt-1">
                          <span className="font-medium">出動内容:</span> {record.incidentType}
                        </p>
                      )}
                    </div>
                    <div className="text-xs">
                      <span
                        className={`inline-block px-2 py-1 rounded ${
                          record.status === "published"
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {record.status === "published" ? "公開済み" : "下書き"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* フッター */}
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full bg-gray-600 text-white py-2 rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
