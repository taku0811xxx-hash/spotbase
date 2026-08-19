"use client";

import { useState } from "react";
import { type DispatchRecord } from "@/lib/dispatchRecords";
import ActivityDetailsModal from "./ActivityDetailsModal";

type ActivityStats = {
  recordedBy: string;
  category: string;
  totalCount: number;
  lastDispatchDate: string;
  topSites: Array<{ name: string; count: number }>;
};

type PeriodType = "all" | "thisMonth" | "lastMonth" | "last30Days" | "thisYear";

interface Props {
  records: DispatchRecord[];
  organizationId: string;
  selectedCategory: string | null;
  onCategoryChange: (category: string | null) => void;
}

export default function ActivityDashboard({
  records,
  organizationId,
  selectedCategory,
  onCategoryChange,
}: Props) {
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>("all");

  // カテゴリーの一覧を取得
  const categories = Array.from(new Set(records.map((r) => r.category))).sort();
  const allCategories = ["記者", "技術", "カメラマン", "ディレクター"].filter((c) =>
    categories.includes(c)
  );

  // 集計データを計算
  const stats = calculateStats(records, selectedCategory, selectedPeriod);

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      {/* 期間フィルター */}
      <div className="flex gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-700 py-2">期間:</span>
        {(["all", "thisMonth", "lastMonth", "last30Days", "thisYear"] as const).map((period) => {
          const labels: Record<PeriodType, string> = {
            all: "全期間",
            thisMonth: "今月",
            lastMonth: "先月",
            last30Days: "直近30日",
            thisYear: "今年度",
          };
          return (
            <button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                selectedPeriod === period
                  ? "bg-green-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {labels[period]}
            </button>
          );
        })}
      </div>

      {/* カテゴリーフィルター */}
      <div className="flex gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-700 py-2">分類:</span>
        <button
          onClick={() => onCategoryChange(null)}
          className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            selectedCategory === null
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          すべて
        </button>
        {allCategories.map((cat) => (
          <button
            key={cat}
            onClick={() => onCategoryChange(cat)}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              selectedCategory === cat
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 集計テーブル */}
      <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left font-semibold text-gray-700">クルー名</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">分類</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">
                累計出動回数
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">
                主な現場（TOP 3）
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">直近出動日</th>
            </tr>
          </thead>
          <tbody>
            {stats.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  出動記録がありません
                </td>
              </tr>
            ) : (
              stats.map((stat) => (
                <tr
                  key={stat.recordedBy}
                  className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setSelectedUser(stat.recordedBy)}
                >
                  <td className="px-4 py-3 font-medium text-blue-600 hover:underline">
                    {stat.recordedBy}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{stat.category}</td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-900">
                    {stat.totalCount}回
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="space-y-0.5 text-xs">
                      {stat.topSites.map((site, idx) => (
                        <div key={idx}>
                          {site.name}（{site.count}回）
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{stat.lastDispatchDate}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 詳細モーダル */}
      {selectedUser && (
        <ActivityDetailsModal
          recordedBy={selectedUser}
          records={records}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}

function calculateStats(
  records: DispatchRecord[],
  selectedCategory: string | null,
  selectedPeriod: PeriodType
): ActivityStats[] {
  // 期間フィルタリング関数
  function isWithinPeriod(date: Date | undefined, period: PeriodType): boolean {
    if (!date) return false;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    switch (period) {
      case "all":
        return true;
      case "thisMonth": {
        const start = new Date(currentYear, currentMonth, 1);
        const end = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
        return date >= start && date <= end;
      }
      case "lastMonth": {
        const start = new Date(currentYear, currentMonth - 1, 1);
        const end = new Date(currentYear, currentMonth, 0, 23, 59, 59);
        return date >= start && date <= end;
      }
      case "last30Days": {
        const start = new Date(now);
        start.setDate(start.getDate() - 30);
        start.setHours(0, 0, 0, 0);
        return date >= start && date <= now;
      }
      case "thisYear": {
        const start = new Date(currentYear, 0, 1);
        const end = new Date(currentYear, 11, 31, 23, 59, 59);
        return date >= start && date <= end;
      }
      default:
        return false;
    }
  }

  // フィルタリング
  let filtered = records;

  // 期間フィルター
  filtered = filtered.filter((r) => {
    const date = r.createdAt?.toDate?.();
    return isWithinPeriod(date, selectedPeriod);
  });

  // カテゴリーフィルター
  if (selectedCategory) {
    filtered = filtered.filter((r) => r.category === selectedCategory);
  }

  // ユーザー別に集計
  const userMap = new Map<string, DispatchRecord[]>();
  filtered.forEach((record) => {
    if (!userMap.has(record.recordedBy)) {
      userMap.set(record.recordedBy, []);
    }
    userMap.get(record.recordedBy)!.push(record);
  });

  // 統計を計算
  const stats: ActivityStats[] = [];
  userMap.forEach((userRecords, recordedBy) => {
    // 現場の集計
    const siteMap = new Map<string, number>();
    userRecords.forEach((r) => {
      siteMap.set(r.locationName, (siteMap.get(r.locationName) ?? 0) + 1);
    });

    // トップ3の現場を取得
    const topSites = Array.from(siteMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // 直近出動日を取得
    const lastRecord = userRecords.reduce((prev, curr) => {
      const prevTime = prev.createdAt?.toMillis?.() ?? 0;
      const currTime = curr.createdAt?.toMillis?.() ?? 0;
      return currTime > prevTime ? curr : prev;
    });
    const lastDispatchDate = lastRecord.createdAt
      ?.toDate?.()
      .toLocaleDateString("ja-JP") ?? "不明";

    stats.push({
      recordedBy,
      category: userRecords[0]?.category ?? "不明",
      totalCount: userRecords.length,
      lastDispatchDate,
      topSites,
    });
  });

  // クルー名でソート
  stats.sort((a, b) => a.recordedBy.localeCompare(b.recordedBy));

  return stats;
}
