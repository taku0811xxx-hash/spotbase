"use client";

// 「ここトレ！」マイページ専用: アカウント削除(退会)の確認モーダル。
import { useState } from "react";
import { deleteAccountErrorMessage, deletePhotoAccount } from "@/lib/photoAccountDeletion";

export default function DeleteAccountModal({ onClose, onDeleted }: { onClose: () => void; onDeleted: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setBusy(true);
    setError("");
    try {
      await deletePhotoAccount(password);
      onDeleted();
    } catch (e) {
      console.error("ここトレ！: アカウント削除に失敗しました", e);
      setError(deleteAccountErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] bg-black/50 flex items-end sm:items-center justify-center" onClick={busy ? undefined : onClose}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-gray-900">アカウントを削除</h3>
        <p className="text-sm text-gray-700 leading-relaxed">
          アカウントを削除すると、投稿した写真やデータがすべて消去されます。本当に削除しますか？この操作は取り消せません。
        </p>
        <div>
          <label className="block text-xs text-gray-500 mb-1">確認のためパスワードを入力してください</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} disabled={busy} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium">
            キャンセル
          </button>
          <button
            onClick={handleDelete}
            disabled={busy || !password}
            className="flex-1 bg-red-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "削除中..." : "削除する"}
          </button>
        </div>
      </div>
    </div>
  );
}
