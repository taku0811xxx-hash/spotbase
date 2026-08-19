"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDispatchRecordsNear, type DispatchRecord } from "@/lib/dispatchRecords";
import { useAuth } from "@/components/AuthProvider";

type Props = {
  pinId: string;
  lat: number;
  lng: number;
};

// この現場の付近で行われた過去の出動記録を集約して表示する。
// 出動記録に書かれた記録メモや伝送状況を、現場情報の一部として横断的に見れるようにするもの。
export default function DispatchHistorySummary({ pinId, lat, lng }: Props) {
  const { profile } = useAuth();
  const [records, setRecords] = useState<DispatchRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    getDispatchRecordsNear(lat, lng, {
      organizationId: profile.organizationId,
      category: profile.category,
      isAdmin: profile.accessLevel === "admin",
    })
      .then(setRecords)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [lat, lng, profile]);

  const notesFromHistory = records.filter((r) => r.notes?.length > 0);

  return (
    <div className="border-t pt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-700">
          {records.length > 0 ? `過去の出動記録（${records.length}件）` : "出動記録"}
        </p>
        <Link
          href={`/dispatch/new?pinId=${pinId}`}
          className="text-xs text-blue-600 border border-blue-200 bg-blue-50 rounded-lg px-2.5 py-1 hover:bg-blue-100 hover:border-blue-300 hover:shadow-sm active:scale-[0.98] transition-all duration-150"
        >
          {records.length === 0 ? "+ 最初の出動記録を追加" : "+ 新しく出動記録を追加"}
        </Link>
      </div>

      {loading && <p className="text-xs text-gray-400">検索中...</p>}

      {!loading && records.length === 0 && (
        <p className="text-xs text-gray-400">
          この付近での出動記録はまだありません
        </p>
      )}

      {!loading && notesFromHistory.length > 0 && (
        <div className="space-y-1.5 mb-2">
          <p className="text-[11px] font-medium text-gray-500">過去の記録メモまとめ</p>
          {notesFromHistory.map((r) => {
            const createdAt = r.createdAt?.toDate?.();
            return (
              <div key={r.id} className="bg-gray-50 rounded-lg px-2.5 py-2">
                <p className="text-[11px] text-gray-500">
                  {createdAt && createdAt.toLocaleDateString("ja-JP")}
                  {r.incidentType && ` / ${r.incidentType}`}
                </p>
                {r.notes.map((note, i) => (
                  <div key={i} className="mt-1">
                    {note.title && (
                      <p className="text-xs font-medium text-gray-800">{note.title}</p>
                    )}
                    <p className="text-xs text-gray-700 whitespace-pre-wrap">{note.body}</p>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {!loading && records.length > 0 && (
        <ul className="space-y-1">
          {records.map((r) => {
            const createdAt = r.createdAt?.toDate?.();
            return (
              <li key={r.id} className="text-xs">
                <Link href={`/dispatch/${r.id}`} className="text-blue-600 hover:underline">
                  {createdAt && createdAt.toLocaleDateString("ja-JP")}
                  {r.incidentType && ` ${r.incidentType}`}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
