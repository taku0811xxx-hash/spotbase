"use client";

import { useState } from "react";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import {
  updateFieldRecord,
  type ActivityLog,
  type FieldRecord,
  type SpotReport,
} from "@/lib/spotRecords";
import type { Pin } from "@/lib/pins";
import ActivityLogSection from "./ActivityLogSection";
import ReportSection from "./ReportSection";

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm";

function toDateInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 現場記録(日付単位)を新しい順に並べ、各記録の中に対応履歴と報告書を表示する。
// 現場記録に属さない旧データは末尾の「記録に未分類」枠にまとめる。
export default function FieldRecordTimeline({
  pin,
  records,
  reports,
  logs,
  onChanged,
}: {
  pin: Pin;
  records: FieldRecord[];
  reports: SpotReport[];
  logs: ActivityLog[];
  onChanged: () => void;
}) {
  const { user, profile } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordIds = new Set(records.map((r) => r.id));
  const legacyLogs = logs.filter((l) => !l.fieldRecordId || !recordIds.has(l.fieldRecordId));
  const legacyReports = reports.filter((r) => !r.fieldRecordId || !recordIds.has(r.fieldRecordId));

  function startEdit(r: FieldRecord) {
    setEditingId(r.id);
    setDate(toDateInput(r.recordDate.toDate()));
    setTitle(r.title);
    setNotes(r.interviewNotes);
  }

  async function saveEdit() {
    if (!editingId || !title.trim() || !date) return;
    setSaving(true);
    try {
      await updateFieldRecord(editingId, {
        recordDate: Timestamp.fromDate(new Date(`${date}T00:00:00`)),
        title: title.trim(),
        interviewNotes: notes,
      });
      setEditingId(null);
      onChanged();
    } catch (err) {
      console.error(err);
      setError("更新に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  if (records.length === 0 && legacyLogs.length === 0 && legacyReports.length === 0) {
    return <p className="text-sm text-gray-500">現場記録はまだありません</p>;
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {records.map((r) => {
        const canEdit = r.authorUid === user?.uid || profile?.accessLevel === "admin";
        return (
          <details key={r.id} className="border border-gray-200 rounded-xl" open={records[0]?.id === r.id}>
            <summary className="cursor-pointer px-3 py-2 flex justify-between gap-2 items-baseline">
              <span className="font-medium text-sm truncate">
                {r.recordDate?.toDate?.().toLocaleDateString("ja-JP")} {r.title}
              </span>
              <span className="text-xs text-gray-500 whitespace-nowrap">{r.authorName}</span>
            </summary>
            <div className="px-3 pb-3 space-y-4">
              {editingId === r.id ? (
                <div className="space-y-2 bg-gray-50 rounded-lg p-2">
                  <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
                  <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
                  <textarea className={inputCls} rows={3} placeholder="取材メモ" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setEditingId(null)} className="text-sm px-3 py-1 rounded-lg hover:bg-gray-100">
                      キャンセル
                    </button>
                    <button type="button" onClick={saveEdit} disabled={saving} className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1 disabled:opacity-50">
                      更新
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm">
                  {r.interviewNotes && (
                    <div>
                      <p className="text-xs text-gray-500">取材メモ</p>
                      <p className="whitespace-pre-wrap break-words">{r.interviewNotes}</p>
                    </div>
                  )}
                  {canEdit && (
                    <button type="button" onClick={() => startEdit(r)} className="text-xs text-blue-600 mt-1">
                      記録を編集
                    </button>
                  )}
                </div>
              )}
              <ActivityLogSection
                pin={pin}
                fieldRecordId={r.id}
                logs={logs.filter((l) => l.fieldRecordId === r.id)}
                onChanged={onChanged}
              />
              <ReportSection
                pin={pin}
                fieldRecordId={r.id}
                reports={reports.filter((x) => x.fieldRecordId === r.id)}
                onChanged={onChanged}
              />
            </div>
          </details>
        );
      })}

      {(legacyLogs.length > 0 || legacyReports.length > 0) && (
        <details className="border border-dashed border-gray-300 rounded-xl">
          <summary className="cursor-pointer px-3 py-2 text-sm text-gray-600">記録に未分類(旧データ)</summary>
          <div className="px-3 pb-3 space-y-4">
            <ActivityLogSection pin={pin} logs={legacyLogs} onChanged={onChanged} />
            <ReportSection pin={pin} reports={legacyReports} onChanged={onChanged} />
          </div>
        </details>
      )}
    </div>
  );
}
