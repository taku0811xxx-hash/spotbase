"use client";

// 「ここトレ！」サポート・お問い合わせページ(App Store提出用の公開ページ)。
import { useState } from "react";
import Link from "next/link";
import { SUPPORT_CATEGORIES, sendSupportInquiry, type SupportCategory } from "@/lib/support";

export default function SupportPage() {
  const [category, setCategory] = useState<SupportCategory>(SUPPORT_CATEGORIES[0]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      await sendSupportInquiry({ category, name, email, message });
      setDone(true);
    } catch (err) {
      console.error("ここトレ！: お問い合わせの送信に失敗しました", err);
      setError("送信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setSending(false);
    }
  }

  const inputClass =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-shadow";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-xl font-bold text-gray-900">ここトレ！ サポート・お問い合わせ</h1>
        <p className="text-sm text-gray-700 leading-relaxed">
          このページは「ここトレ！」に関するお問い合わせやご意見・ご要望を受け付けるサポートページです。
          使い方のご質問、不具合のご報告、機能のご要望などを下記のフォームからお送りください。
          内容を確認のうえ、必要に応じてご記入いただいたメールアドレスへご連絡します。
        </p>
        <p className="text-xs text-gray-500">
          不適切な投稿やユーザーの通報は、アプリ内の各投稿の「…」メニューから行えます。
        </p>

        {done ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center space-y-3">
            <p className="text-sm text-gray-800">お問い合わせありがとうございます。送信しました。</p>
            <Link href="/" className="inline-block text-sm text-orange-600 hover:underline">
              ホームへ戻る
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">お問い合わせ種別</label>
              <div className="flex flex-wrap gap-2">
                {SUPPORT_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full border ${
                      category === c ? "bg-orange-500 text-white border-orange-500" : "border-gray-200 text-gray-600"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">お名前(任意)</label>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">メールアドレス</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={200}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">お問い合わせ内容</label>
              <textarea
                required
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                className={inputClass}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={sending || !message.trim() || !email.trim()}
              className="w-full rounded-lg py-2.5 font-medium text-white bg-gradient-to-r from-orange-500 to-pink-500 shadow-sm disabled:opacity-50"
            >
              {sending ? "送信中..." : "送信する"}
            </button>
          </form>
        )}

        <div className="text-center text-xs text-gray-500 space-x-4">
          <Link href="/terms" className="underline">利用規約</Link>
          <Link href="/" className="underline">ホーム</Link>
        </div>
      </div>
    </div>
  );
}
