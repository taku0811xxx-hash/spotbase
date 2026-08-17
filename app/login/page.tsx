"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, requestPasswordReset } from "@/lib/auth";
import Logo from "@/components/Logo";

function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "IDまたはパスワードが正しくありません";
  }
  if (code === "auth/too-many-requests") {
    return "試行回数が多すぎます。しばらくしてから再度お試しください";
  }
  return "ログインに失敗しました";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [resetMode, setResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      router.push("/");
    } catch (err) {
      console.error(err);
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResetError("");
    setResetMessage("");
    setResetSubmitting(true);
    try {
      await requestPasswordReset(resetEmail);
      setResetMessage("パスワード再設定用のメールを送信しました。受信箱を確認してください。");
    } catch (err) {
      console.error(err);
      setResetError("送信に失敗しました。IDを確認してください");
    } finally {
      setResetSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-gray-900 py-6 flex justify-center">
          <Logo className="text-white" size="lg" />
        </div>
        <div className="p-8">
          <p className="text-sm text-gray-500 text-center mb-6">
            現場情報を蓄積・共有するアプリ
          </p>

          {!resetMode ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  ID(メールアドレス)
                </label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  パスワード
                </label>
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                />
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-medium shadow-sm hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
              >
                {submitting ? "ログイン中..." : "ログイン"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setResetMode(true);
                  setResetEmail(email);
                }}
                className="w-full text-center text-xs text-gray-500 hover:text-gray-700 hover:underline"
              >
                パスワードをお忘れの方はこちら
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetSubmit} className="space-y-4">
              <p className="text-xs text-gray-500">
                登録済みのID(メールアドレス)を入力してください。パスワード再設定用のリンクを送ります。
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  ID(メールアドレス)
                </label>
                <input
                  required
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                />
              </div>
              {resetMessage && (
                <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-3 py-2">
                  {resetMessage}
                </div>
              )}
              {resetError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                  {resetError}
                </div>
              )}
              <button
                type="submit"
                disabled={resetSubmitting}
                className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-medium shadow-sm hover:bg-blue-700 hover:shadow-md transition-all duration-150 disabled:opacity-50"
              >
                {resetSubmitting ? "送信中..." : "再設定メールを送る"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setResetMode(false);
                  setResetMessage("");
                  setResetError("");
                }}
                className="w-full text-center text-xs text-gray-500 hover:text-gray-700 hover:underline"
              >
                ログイン画面に戻る
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
