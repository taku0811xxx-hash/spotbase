"use client";

// 「ここトレ！」マイページ専用: 開発者への要望・改善リクエスト送信モーダル。
import { useState } from "react";
import { X } from "lucide-react";
import { FEEDBACK_CATEGORIES, sendFeedback, type FeedbackCategory } from "@/lib/feedback";

export default function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<FeedbackCategory>(FEEDBACK_CATEGORIES[0]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSend() {
    if (!message.trim()) return;
    setSending(true);
    setError("");
    try {
      await sendFeedback(category, message);
      setDone(true);
    } catch (e) {
      console.error("ここトレ！: 要望の送信に失敗しました", e);
      setError("送信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900">開発者へ要望・改善案を送る</h3>
          <button onClick={onClose} aria-label="閉じる" className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        {done ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-gray-700">ご意見ありがとうございます！送信しました。</p>
            <button onClick={onClose} className="px-5 py-2 text-sm font-semibold rounded-lg bg-gray-900 text-white">
              閉じる
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {FEEDBACK_CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full border ${
                    category === c ? "bg-orange-500 text-white border-orange-500" : "border-gray-200 text-gray-600"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={1000}
              placeholder="ご要望・気づいた点を自由にご記入ください"
              className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:border-orange-400"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              onClick={handleSend}
              disabled={sending || !message.trim()}
              className="w-full py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-orange-500 to-pink-500 text-white disabled:opacity-40"
            >
              {sending ? "送信中..." : "送信する"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
