"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { addReport, listReports, updateReport, type SpotReport } from "@/lib/spotRecords";
import type { Pin } from "@/lib/pins";

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm";

export default function ReportSection({ pin }: { pin: Pin }) {
  const { user, profile } = useAuth();
  const [reports, setReports] = useState<SpotReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setReports(
        await listReports({
          organizationId: profile.organizationId,
          targetType: "pin",
          targetId: pin.id,
        })
      );
      setError(null);
    } catch (err) {
      console.error(err);
      setError("報告書の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [profile, pin.id]);

  useEffect(() => {
    load();
  }, [load]);

  function reset() {
    setAdding(false);
    setEditingId(null);
    setTitle("");
    setBody("");
    setInterviewNotes("");
    setFiles([]);
  }

  function startEdit(r: SpotReport) {
    setEditingId(r.id);
    setAdding(true);
    setTitle(r.title);
    setBody(r.body);
    setInterviewNotes(r.interviewNotes);
  }

  async function handleSave() {
    if (!user || !profile || !title.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateReport(editingId, { title: title.trim(), body, interviewNotes });
      } else {
        await addReport(
          {
            organizationId: pin.organizationId,
            category: pin.category,
            targetType: "pin",
            targetId: pin.id,
            title: title.trim(),
            body,
            interviewNotes,
            authorUid: user.uid,
            authorName: profile.name,
          },
          files
        );
      }
      reset();
      await load();
    } catch (err) {
      console.error(err);
      setError("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  const canEdit = (r: SpotReport) => r.authorUid === user?.uid || profile?.accessLevel === "admin";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">過去報告書</h2>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50"
          >
            報告書を追加
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {adding && (
        <div className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
          <input className={inputCls} placeholder="タイトル" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className={inputCls} rows={5} placeholder="本文 / 文字起こしテキスト" value={body} onChange={(e) => setBody(e.target.value)} />
          <textarea className={inputCls} rows={3} placeholder="取材メモ(注意事項・補足など)" value={interviewNotes} onChange={(e) => setInterviewNotes(e.target.value)} />
          {!editingId && (
            <input type="file" multiple className="text-sm" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          )}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={reset} className="text-sm px-3 py-1.5 rounded-lg hover:bg-gray-100">
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              {saving ? "保存中..." : editingId ? "更新" : "登録"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-gray-500">報告書はまだありません</p>
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li key={r.id} className="border border-gray-200 rounded-xl">
              <details>
                <summary className="cursor-pointer px-3 py-2 text-sm flex justify-between gap-2">
                  <span className="font-medium truncate">{r.title}</span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {r.createdAt?.toDate?.().toLocaleDateString("ja-JP")} / {r.authorName}
                  </span>
                </summary>
                <div className="px-3 pb-3 space-y-2 text-sm">
                  {r.body && <p className="whitespace-pre-wrap break-words">{r.body}</p>}
                  {r.interviewNotes && (
                    <div>
                      <p className="text-xs text-gray-500">取材メモ</p>
                      <p className="whitespace-pre-wrap break-words">{r.interviewNotes}</p>
                    </div>
                  )}
                  {r.attachmentUrls.length > 0 && (
                    <ul className="text-xs space-y-0.5">
                      {r.attachmentUrls.map((u, i) => (
                        <li key={u}>
                          <a href={u} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                            添付ファイル {i + 1}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {canEdit(r) && (
                    <button type="button" onClick={() => startEdit(r)} className="text-xs text-blue-600">
                      編集
                    </button>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
