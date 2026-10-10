"use client";

import { useState } from "react";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import {
  ACTIVITY_ACTION_LABELS,
  ACTIVITY_ACTION_TYPES,
  ACTIVITY_STATUSES,
  ACTIVITY_STATUS_META,
  addActivityLog,
  updateActivityLog,
  type ActivityActionType,
  type ActivityLog,
  type ActivityStatus,
} from "@/lib/spotRecords";
import type { Pin } from "@/lib/pins";

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm";

// datetime-local用("YYYY-MM-DDTHH:mm"、ローカル時刻)
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ActivityLogSection({
  pin,
  fieldRecordId,
  logs,
  onChanged,
}: {
  pin: Pin;
  fieldRecordId?: string; // 未指定は旧データ枠(追加不可)
  logs: ActivityLog[];
  onChanged: () => void;
}) {
  const { user, profile } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loggedAt, setLoggedAt] = useState(toLocalInput(new Date()));
  const [actorName, setActorName] = useState("");
  const [actionType, setActionType] = useState<ActivityActionType>("contact");
  const [status, setStatus] = useState<ActivityStatus>("pending");
  const [detail, setDetail] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function startAdd() {
    setEditingId(null);
    setLoggedAt(toLocalInput(new Date()));
    setActorName(profile?.name ?? "");
    setActionType("contact");
    setStatus("pending");
    setDetail("");
    setInterviewNotes("");
    setAdding(true);
  }

  function startEdit(l: ActivityLog) {
    setEditingId(l.id);
    setLoggedAt(toLocalInput(l.loggedAt.toDate()));
    setActorName(l.actorName);
    setActionType(l.actionType);
    setStatus(l.status);
    setDetail(l.detail);
    setInterviewNotes(l.interviewNotes);
    setAdding(true);
  }

  async function handleSave() {
    if (!user || !profile || !detail.trim() || !loggedAt) return;
    setSaving(true);
    try {
      const at = Timestamp.fromDate(new Date(loggedAt));
      if (editingId) {
        await updateActivityLog(editingId, {
          loggedAt: at,
          actorName: actorName.trim(),
          actionType,
          status,
          detail,
          interviewNotes,
        });
      } else {
        await addActivityLog({
          organizationId: pin.organizationId,
          category: pin.category,
          targetType: "pin",
          targetId: pin.id,
          loggedAt: at,
          actorUid: user.uid,
          actorName: actorName.trim() || profile.name,
          actionType,
          status,
          detail,
          interviewNotes,
          createdByUid: user.uid,
          fieldRecordId,
        });
      }
      setAdding(false);
      setEditingId(null);
      onChanged();
    } catch (err) {
      console.error(err);
      setError("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  const canEdit = (l: ActivityLog) => l.createdByUid === user?.uid || profile?.accessLevel === "admin";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">対応履歴</h3>
        {!adding && fieldRecordId && (
          <button type="button" onClick={startAdd} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">
            対応を記録
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {adding && (
        <div className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input type="datetime-local" className={inputCls} value={loggedAt} onChange={(e) => setLoggedAt(e.target.value)} />
            <input className={inputCls} placeholder="対応者" value={actorName} onChange={(e) => setActorName(e.target.value)} />
            <select className={inputCls} value={actionType} onChange={(e) => setActionType(e.target.value as ActivityActionType)}>
              {ACTIVITY_ACTION_TYPES.map((t) => (
                <option key={t} value={t}>{ACTIVITY_ACTION_LABELS[t]}</option>
              ))}
            </select>
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as ActivityStatus)}>
              {ACTIVITY_STATUSES.map((s) => (
                <option key={s} value={s}>{ACTIVITY_STATUS_META[s].label}</option>
              ))}
            </select>
          </div>
          <textarea className={inputCls} rows={3} placeholder="対応詳細" value={detail} onChange={(e) => setDetail(e.target.value)} />
          <textarea className={inputCls} rows={3} placeholder="取材メモ(注意事項・補足など)" value={interviewNotes} onChange={(e) => setInterviewNotes(e.target.value)} />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setAdding(false)} className="text-sm px-3 py-1.5 rounded-lg hover:bg-gray-100">
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !detail.trim()}
              className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              {saving ? "保存中..." : editingId ? "更新" : "記録"}
            </button>
          </div>
        </div>
      )}

      {logs.length === 0 ? (
        <p className="text-xs text-gray-500">対応履歴はありません</p>
      ) : (
        <ol className="border-l-2 border-gray-200 ml-1 space-y-3">
          {logs.map((l) => {
            const meta = ACTIVITY_STATUS_META[l.status];
            return (
              <li key={l.id} className="pl-3 text-sm space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500">
                    {l.loggedAt?.toDate?.().toLocaleString("ja-JP")}
                  </span>
                  <span className={`text-[11px] border rounded-full px-2 py-0.5 ${meta.className}`}>{meta.label}</span>
                  <span className="text-xs text-gray-600">
                    {ACTIVITY_ACTION_LABELS[l.actionType]} / {l.actorName}
                  </span>
                  {canEdit(l) && (
                    <button type="button" onClick={() => startEdit(l)} className="text-xs text-blue-600">
                      編集
                    </button>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words">{l.detail}</p>
                {l.interviewNotes && (
                  <p className="whitespace-pre-wrap break-words text-xs text-gray-600">
                    取材メモ: {l.interviewNotes}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
