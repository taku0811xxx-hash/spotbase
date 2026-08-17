"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import PageHeader from "@/components/PageHeader";
import Toast, { type ToastState } from "@/components/Toast";

type OrgUser = {
  uid: string;
  name: string;
  email: string;
  category: string;
  accessLevel: "admin" | "member";
};

const inputClass =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

export default function AdminUsersPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();

  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [toast, setToast] = useState<ToastState>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [category, setCategory] = useState("");
  const [accessLevel, setAccessLevel] = useState<"admin" | "member">("member");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (profile && profile.accessLevel !== "admin") {
      router.push("/");
    }
  }, [authLoading, user, profile, router]);

  async function loadUsers() {
    if (!user) return;
    setLoadingUsers(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (res.ok) setUsers(data.users);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    if (profile?.accessLevel === "admin") loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ name, email, password, category, accessLevel }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ type: "error", message: data.error || "作成に失敗しました" });
        return;
      }
      setToast({ type: "success", message: `${name}さんのアカウントを作成しました` });
      setName("");
      setEmail("");
      setPassword("");
      setCategory("");
      setAccessLevel("member");
      loadUsers();
    } catch (err) {
      console.error(err);
      setToast({ type: "error", message: "作成に失敗しました" });
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || !profile) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="ユーザー管理" />
        <p className="p-4 text-sm text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (profile.accessLevel !== "admin") {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="ユーザー管理" />
        <p className="p-4 text-sm text-gray-500">このページは管理者のみ利用できます。</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <PageHeader title="ユーザー管理" />

      <div className="max-w-2xl mx-auto p-5 sm:p-10 space-y-6">
        <section className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900">新しいメンバーを追加</h2>
            <p className="text-xs text-gray-500 mt-1">
              {profile.organizationName}に所属するメンバーとして、ID(メールアドレス)とパスワードを発行します。
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">名前</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                ID(メールアドレス)
              </label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                初期パスワード(6文字以上)
              </label>
              <input
                required
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
              <p className="text-[11px] text-gray-400 mt-1">
                本人には別途伝えてください。ログイン後、本人が変更することも可能です(パスワード再設定リンクから)。
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">分類</label>
              <input
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="例: 記者、カメラマン、ディレクター"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">権限</label>
              <select
                value={accessLevel}
                onChange={(e) => setAccessLevel(e.target.value as "admin" | "member")}
                className={inputClass}
              >
                <option value="member">一般ユーザー(同じ分類の記録のみ閲覧可)</option>
                <option value="admin">管理者(組織内の全分類を閲覧可)</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? "作成中..." : "アカウントを作成"}
            </button>
          </form>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8">
          <h2 className="font-semibold text-gray-900 mb-3">
            {profile.organizationName}のメンバー
          </h2>
          {loadingUsers && <p className="text-sm text-gray-500">読み込み中...</p>}
          {!loadingUsers && users.length === 0 && (
            <p className="text-sm text-gray-500">メンバーがいません</p>
          )}
          {!loadingUsers && users.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="py-1.5 font-medium">名前</th>
                  <th className="py-1.5 font-medium">ID(メール)</th>
                  <th className="py-1.5 font-medium">分類</th>
                  <th className="py-1.5 font-medium">権限</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.uid} className="border-b border-gray-50">
                    <td className="py-1.5 text-gray-900">{u.name}</td>
                    <td className="py-1.5 text-gray-600">{u.email}</td>
                    <td className="py-1.5 text-gray-600">{u.category}</td>
                    <td className="py-1.5 text-gray-600">
                      {u.accessLevel === "admin" ? "管理者" : "一般ユーザー"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
