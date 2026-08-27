"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDispatchRecords, getDraftRecords, filterDispatchRecords, type DispatchRecord } from "@/lib/dispatchRecords";
import { useAuth } from "@/components/AuthProvider";
import PageHeader from "@/components/PageHeader";

export default function DispatchListPage() {
  const { profile } = useAuth();
  const [drafts, setDrafts] = useState<DispatchRecord[]>([]);
  const [records, setRecords] = useState<DispatchRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<DispatchRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // フィルター状態
  const [keyword, setKeyword] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");

  useEffect(() => {
    if (!profile) return;

    Promise.all([
      // 下書き取得
      getDraftRecords({
        organizationId: profile.organizationId,
        category: profile.category,
        isAdmin: profile.accessLevel === "admin",
      }),
      // 正式記録取得
      getDispatchRecords({
        organizationId: profile.organizationId,
        category: profile.category,
        isAdmin: profile.accessLevel === "admin",
      }),
    ])
      .then(([draftList, recordList]) => {
        setDrafts(draftList);
        // 従来の下書き→提出フロー(status: "published")に加え、
        // 「新規出動」クイックフローで対応完了(status: "完了")になった記録も
        // 「出動記録」一覧として確認できるようにする
        const publishedRecords = recordList.filter(
          (r) => r.status === "published" || r.status === "完了"
        );
        setRecords(publishedRecords);
        setFilteredRecords(publishedRecords);
      })
      .catch((err) => {
        console.error("出動記録の読み込みに失敗しました:", err);
        // エラーが発生しても、空の配列を設定して画面を表示
        setDrafts([]);
        setRecords([]);
        setFilteredRecords([]);
      })
      .finally(() => setLoading(false));
  }, [profile]);

  // フィルター条件が変わったときに再度フィルタリング
  useEffect(() => {
    const filtered = filterDispatchRecords(records, {
      keyword: keyword || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      sortBy,
    });
    setFilteredRecords(filtered);
  }, [keyword, startDate, endDate, sortBy, records]);

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title="出動記録一覧"
        action={
          <Link
            href="/dispatch/new"
            className="bg-blue-600 text-white text-sm font-medium rounded-lg px-4 py-2 shadow-sm hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150"
          >
            + 出動記録
          </Link>
        }
      />

      <div className="max-w-4xl mx-auto p-5 sm:p-10 space-y-8">
        {loading && <p className="text-sm text-gray-500">読み込み中...</p>}

        {/* 下書き一覧セクション */}
        {!loading && drafts.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">📝 下書き一覧</h2>
              <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-1">
                {drafts.length}件
              </span>
            </div>
            <ul className="space-y-2">
              {drafts.map((draft) => {
                const draftSavedAt = draft.draftSavedAt?.toDate?.();
                return (
                  <li
                    key={draft.id}
                    className="bg-white rounded-xl border-2 border-amber-200 p-4 hover:shadow-sm hover:bg-amber-50 transition-all duration-150"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">{draft.locationName || "（場所未設定）"}</p>
                        {draft.incidentType && (
                          <p className="text-sm text-gray-600">{draft.incidentType}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {draft.recordedBy || "不明"}
                          {draftSavedAt && ` / 保存: ${draftSavedAt.toLocaleString("ja-JP")}`}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Link
                          href={`/dispatch/new?draftId=${draft.id}`}
                          className="text-xs text-blue-600 border border-blue-200 bg-blue-50 rounded-lg px-3 py-1.5 hover:bg-blue-100 hover:border-blue-300 transition-all duration-150"
                        >
                          編集
                        </Link>
                        <Link
                          href={`/dispatch/${draft.id}`}
                          className="text-xs text-gray-600 border border-gray-300 bg-gray-50 rounded-lg px-3 py-1.5 hover:bg-gray-100 hover:border-gray-400 transition-all duration-150"
                        >
                          詳細
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* 正式記録セクション */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">✓ 正式記録</h2>
            {!loading && records.length > 0 && (
              <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-1">
                {records.length}件
              </span>
            )}
          </div>

          {!loading && records.length === 0 && drafts.length === 0 && (
            <p className="text-sm text-gray-500">まだ出動記録がありません。「+ 出動記録」から新規作成できます。</p>
          )}

          {!loading && records.length === 0 && drafts.length > 0 && (
            <p className="text-sm text-gray-500">正式に提出された記録はまだありません。</p>
          )}

          {/* 検索・フィルタリング UI */}
          {!loading && records.length > 0 && (
            <div className="w-full max-w-full box-border bg-white rounded-xl border border-gray-200 p-4 space-y-3 overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
                {/* フリーワード検索 */}
                <div className="min-w-0">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    フリーワード検索
                  </label>
                  <input
                    type="text"
                    placeholder="場所・住所・出動者名"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    className="w-full min-w-0 box-border border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* 開始日 */}
                <div className="min-w-0">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    開始日
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full min-w-0 appearance-none max-w-full box-border border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* 終了日 */}
                <div className="min-w-0">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    終了日
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full min-w-0 appearance-none max-w-full box-border border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* 並び替え */}
                <div className="min-w-0">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    並び替え
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as "newest" | "oldest")}
                    className="w-full min-w-0 appearance-none max-w-full box-border border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="newest">最新順</option>
                    <option value="oldest">古い順</option>
                  </select>
                </div>
              </div>

              {/* フィルター結果 */}
              <div className="text-xs text-gray-600 border-t pt-3">
                {keyword || startDate || endDate ? (
                  <p>
                    {filteredRecords.length}件 が検索条件に一致しました
                    {keyword && ` (キーワード: "${keyword}")`}
                    {startDate && ` (開始日: ${startDate})`}
                    {endDate && ` (終了日: ${endDate})`}
                  </p>
                ) : (
                  <p>{filteredRecords.length}件</p>
                )}
              </div>
            </div>
          )}

          {/* 記録一覧 */}
          <ul className="space-y-2">
            {filteredRecords.map((r) => {
              const createdAt = r.createdAt?.toDate?.();
              return (
                <li
                  key={r.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm hover:border-gray-300 transition-all duration-150 flex items-center justify-between gap-3"
                >
                  <Link href={`/dispatch/${r.id}`} className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{r.locationName}</p>
                    {r.incidentType && (
                      <p className="text-sm text-gray-600">{r.incidentType}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {r.recordedBy || "不明"}
                      {createdAt && ` / ${createdAt.toLocaleString("ja-JP")}`}
                      {" / チェックポイント"}
                      {r.checkpoints?.length ?? 0}件
                    </p>
                  </Link>
                  <Link
                    href={`/dispatch/${r.id}/report`}
                    className="text-xs text-blue-600 border border-blue-200 bg-blue-50 rounded-lg px-3 py-1.5 hover:bg-blue-100 hover:border-blue-300 transition-all duration-150 flex-shrink-0"
                  >
                    報告書
                  </Link>
                </li>
              );
            })}
          </ul>

          {!loading && filteredRecords.length === 0 && records.length > 0 && (
            <p className="text-sm text-gray-500 text-center py-6">
              検索条件に一致する記録がありません
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
