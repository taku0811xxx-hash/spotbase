"use client";

// 「ここトレ！」(APP_MODE === 'photo')専用: 会員登録(新規アカウント作成)画面。
// SpotBase本体(pro)は組織管理者がAdmin SDK経由で発行したアカウントのみを
// 使う招待制のため、この画面はproモードでは絶対に到達させない(直リンクされても
// ログイン画面へ弾く)。作成したアカウントは"photo_users"コレクションにのみ
// プロフィールを持ち、SpotBase本体の組織/分類モデルとは完全に独立している。
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { APP_MODE } from "@/lib/config";
import { signUpPhotoUser, photoSignUpErrorMessage } from "@/lib/photoAuth";
import Logo from "@/components/Logo";
import PhotoBottomNav from "@/components/PhotoBottomNav";

export default function PhotoSignUpPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // pro/walk向けのURLとしてこの画面に来た場合はログイン画面へ戻す
    // (SpotBase本体は自己登録不可・管理者発行アカウントのみのため)
    if (APP_MODE !== "photo") {
      router.replace("/login");
    }
  }, [router]);

  if (APP_MODE !== "photo") return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setErrorCode("");

    if (password.length < 6) {
      setError("パスワードは6文字以上で入力してください");
      return;
    }
    if (password !== passwordConfirm) {
      setError("パスワードとパスワード(確認)が一致しません");
      return;
    }

    setSubmitting(true);
    try {
      await signUpPhotoUser(email, password, displayName);
      // 仮想キーボードを閉じてから遷移する(ログイン画面と同様の対策)
      (document.activeElement as HTMLElement)?.blur();
      router.push("/map");
    } catch (err) {
      console.error(err);
      setErrorCode((err as { code?: string })?.code ?? "");
      setError(photoSignUpErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4 pb-20">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-orange-500 to-pink-500 py-8 flex flex-col items-center gap-1">
          <Logo className="text-white" size="lg" />
          <p className="text-white/90 text-xs">写真で探すフォトスポット共有アプリ</p>
        </div>
        <div className="p-8">
          <h1 className="text-lg font-bold text-gray-900 mb-1 text-center">会員登録</h1>
          <p className="text-sm text-gray-500 text-center mb-6">
            無料会員登録をして、お気に入りの写真や撮影スポットを保存しよう！
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                ニックネーム
              </label>
              <input
                required
                type="text"
                maxLength={30}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例: フォト太郎"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                メールアドレス
              </label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                パスワード
              </label>
              <input
                required
                type="password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6文字以上"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                パスワード(確認)
              </label>
              <input
                required
                type="password"
                minLength={6}
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-shadow"
              />
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 space-y-2">
                {errorCode === "auth/email-already-in-use" ? (
                  <>
                    <p>このメールアドレスは既に登録されています。ログイン画面からログインしてください。</p>
                    <button
                      type="button"
                      onClick={() => router.push(`/login?email=${encodeURIComponent(email)}`)}
                      className="w-full rounded-lg py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
                    >
                      ログイン画面へ
                    </button>
                  </>
                ) : (
                  <p>{error}</p>
                )}
              </div>
            )}
            <p className="text-xs text-gray-500 text-center">
              会員登録することで
              <Link href="/terms" className="text-orange-600 underline">利用規約</Link>
              に同意したものとみなします。不適切なコンテンツの投稿や嫌がらせ行為は禁止で、違反した場合はアカウント停止等の措置を行います。
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg py-2.5 font-medium text-white bg-gradient-to-r from-orange-500 to-pink-500 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
            >
              {submitting ? "登録中..." : "会員登録する"}
            </button>
            <Link
              href="/login"
              className="block text-center text-xs text-gray-500 hover:text-gray-700 hover:underline"
            >
              すでにアカウントをお持ちの方はこちら(ログイン)
            </Link>
          </form>
        </div>
      </div>
      <PhotoBottomNav
        onRequestUpload={() => {
          router.push("/");
          return false;
        }}
        onFilesSelected={() => {}}
      />
    </div>
  );
}
