"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAllPins, searchPins, type Pin } from "@/lib/pins";
import { useAuth } from "@/components/AuthProvider";
import PageHeader from "@/components/PageHeader";

export default function PinsListPage() {
  const { profile } = useAuth();
  const [pins, setPins] = useState<Pin[]>([]);
  const [filteredPins, setFilteredPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(true);

  // フィルター状態
  const [keyword, setKeyword] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");

  useEffect(() => {
    if (!profile) return;

    getAllPins({
      organizationId: profile.organizationId,
      category: profile.category,
      isAdmin: profile.accessLevel === "admin",
    })
      .then((pinList) => {
        setPins(pinList);
        const sorted = [...pinList].sort((a, b) => {
          const at = a.recordedAt?.toMillis?.() ?? 0;
          const bt = b.recordedAt?.toMillis?.() ?? 0;
          return sortBy === "newest" ? bt - at : at - bt;
        });
        setFilteredPins(sorted);
      })
      .catch((err) => {
        console.error("現場情報の読み込みに失敗しました:", err);
        setPins([]);
        setFilteredPins([]);
      })
      .finally(() => setLoading(false));
  }, [profile]);

  // フィルター条件が変わったときに再度フィルタリング
  useEffect(() => {
    let filtered = pins;

    // キーワード検索
    if (keyword) {
      filtered = searchPins(filtered, keyword);
    }

    // ソート
    const sorted = [...filtered].sort((a, b) => {
      const at = a.recordedAt?.toMillis?.() ?? 0;
      const bt = b.recordedAt?.toMillis?.() ?? 0;
      return sortBy === "newest" ? bt - at : at - bt;
    });

    setFilteredPins(sorted);
  }, [keyword, sortBy, pins]);

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title="現場情報一覧"
        action={
          <Link
            href="/pin/new"
            className="bg-blue-600 text-white text-sm font-medium rounded-lg px-4 py-2 shadow-sm hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150"
          >
            + 現場情報
          </Link>
        }
      />

      <div className="max-w-4xl mx-auto p-5 sm:p-10 space-y-8">
        {loading && <p className="text-sm text-gray-500">読み込み中...</p>}

        {!loading && (
          <>
            {/* フィルターセクション */}
            <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  フリーワード検索
                </label>
                <input
                  type="text"
                  placeholder="現場名・住所で検索"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  並び替え
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "newest" | "oldest")}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="newest">最新順</option>
                  <option value="oldest">古い順</option>
                </select>
              </div>

              <p className="text-sm text-gray-600">
                {filteredPins.length}件 の現場情報が見つかりました
              </p>
            </div>

            {/* 現場情報カード一覧 */}
            {filteredPins.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                <p className="text-gray-500 mb-4">現場情報がまだありません</p>
                <Link
                  href="/pin/new"
                  className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  現場情報を作成
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredPins.map((pin) => (
                  <Link
                    key={pin.id}
                    href={`/pin/${pin.id}`}
                    className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-6 group"
                  >
                    <div className="flex flex-col h-full">
                      {/* 現場名と住所 */}
                      <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors mb-2">
                        {pin.name}
                      </h3>
                      <p className="text-sm text-gray-600 mb-4">{pin.address}</p>

                      {/* 情報プレビュー */}
                      <div className="space-y-2 text-sm text-gray-700 mb-4 flex-1">
                        {pin.parkingInfo && (
                          <div className="line-clamp-2">
                            <span className="font-semibold text-gray-800">🅿️ 駐車場所:</span> {pin.parkingInfo}
                          </div>
                        )}
                        {pin.hazards && (
                          <div className="line-clamp-2 text-red-700 bg-red-50 px-3 py-2 rounded">
                            <span className="font-semibold">⚠️ 危険箇所:</span> {pin.hazards}
                          </div>
                        )}
                      </div>

                      {/* メタ情報 */}
                      <div className="text-xs text-gray-500 pt-4 border-t border-gray-200">
                        <p>
                          📍 {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
                        </p>
                        <p>記録者: {pin.recordedBy}</p>
                        <p>分類: {pin.category}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
