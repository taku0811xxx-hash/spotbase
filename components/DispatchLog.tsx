"use client";

import { useEffect, useState } from "react";
import {
  createDispatch,
  deleteDispatch,
  getDispatchesForPin,
  type Dispatch,
} from "@/lib/dispatches";
import { useAuth } from "@/components/AuthProvider";
import Toast, { type ToastState } from "./Toast";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DispatchLog({ pinId }: { pinId: string }) {
  const { profile } = useAuth();
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [date, setDate] = useState(todayStr());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  function refresh() {
    setLoading(true);
    getDispatchesForPin(pinId)
      .then(setDispatches)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const session = profile;
    if (!session) {
      setToast({ type: "error", message: "ログインしてください" });
      return;
    }
    setSubmitting(true);
    try {
      await createDispatch({ pinId, date, recordedBy: session.name, notes });
      setNotes("");
      setDate(todayStr());
      setFormOpen(false);
      refresh();
      setToast({ type: "success", message: "出動記録を追加しました" });
    } catch (err) {
      console.error(err);
      setToast({ type: "error", message: "追加に失敗しました" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDispatch(id);
      setDispatches((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error(err);
      setToast({ type: "error", message: "削除に失敗しました" });
    }
  }

  return (
    <div className="border-t pt-3">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-700">出動記録</p>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="text-xs text-blue-600 border border-blue-200 bg-blue-50 rounded-lg px-2.5 py-1 hover:bg-blue-100 hover:border-blue-300 hover:shadow-sm active:scale-[0.98] transition-all duration-150"
        >
          {formOpen ? "閉じる" : "+ 記録を追加"}
        </button>
      </div>

      {formOpen && (
        <form onSubmit={handleSubmit} className="space-y-2 mb-3 bg-gray-50 rounded-lg p-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">出動日</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">記録</label>
            <textarea
              required
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例: 実際に行ってみて、駐車場所は満車だった。伝送は問題なし"
              className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
              rows={3}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white rounded-lg py-1.5 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {submitting ? "保存中..." : "記録を保存"}
          </button>
        </form>
      )}

      {loading && <p className="text-xs text-gray-400">読み込み中...</p>}
      {!loading && dispatches.length === 0 && (
        <p className="text-xs text-gray-400">まだ出動記録はありません</p>
      )}
      {!loading && dispatches.length > 0 && (
        <ul className="space-y-2">
          {dispatches.map((d) => (
            <li key={d.id} className="bg-gray-50 rounded-lg p-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-700">
                  {d.date} / {d.recordedBy || "不明"}
                </p>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="text-[11px] text-red-500 hover:underline"
                >
                  削除
                </button>
              </div>
              <p className="text-xs text-gray-600 whitespace-pre-wrap mt-0.5">{d.notes}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
