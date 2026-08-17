"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDispatchRecords, type DispatchRecord } from "@/lib/dispatchRecords";
import { useAuth } from "@/components/AuthProvider";
import PageHeader from "@/components/PageHeader";

export default function DispatchListPage() {
  const { profile } = useAuth();
  const [records, setRecords] = useState<DispatchRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    getDispatchRecords({
      organizationId: profile.organizationId,
      category: profile.category,
      isAdmin: profile.accessLevel === "admin",
    })
      .then(setRecords)
      .finally(() => setLoading(false));
  }, [profile]);

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title="出動記録一覧"
        action={
          <Link
            href="/dispatch/new"
            className="bg-blue-600 text-white text-sm font-medium rounded-lg px-4 py-2 shadow-sm hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150"
          >
            + 出動記録
          </Link>
        }
      />

      <div className="max-w-2xl mx-auto p-5 sm:p-10">
        {loading && <p className="text-sm text-gray-500">読み込み中...</p>}
        {!loading && records.length === 0 && (
          <p className="text-sm text-gray-500">まだ出動記録がありません</p>
        )}
        <ul className="space-y-2">
          {records.map((r) => {
            const createdAt = r.createdAt?.toDate?.();
            return (
              <li
                key={r.id}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm hover:border-gray-300 transition-all duration-150 flex items-center justify-between gap-3"
              >
                <Link href={`/dispatch/${r.id}`} className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{r.locationName}</p>
                  {r.incidentType && (
                    <p className="text-sm text-gray-600">{r.incidentType}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    {r.recordedBy || "不明"}
                    {createdAt && ` / ${createdAt.toLocaleString("ja-JP")}`}
                    {" / チェックポイント"}
                    {r.checkpoints?.length ?? 0}件
                  </p>
                </Link>
                <Link
                  href={`/dispatch/${r.id}/report`}
                  className="text-xs text-blue-600 border border-blue-200 bg-blue-50 rounded-lg px-3 py-1.5 hover:bg-blue-100 hover:border-blue-300 transition-all duration-150 flex-shrink-0"
                >
                  報告書
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
