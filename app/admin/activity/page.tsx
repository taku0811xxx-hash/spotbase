"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getDispatchRecordsByOrganization, type DispatchRecord } from "@/lib/dispatchRecords";
import PageHeader from "@/components/PageHeader";
import ActivityDashboard from "@/components/ActivityDashboard";

export default function ActivityPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [records, setRecords] = useState<DispatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    // 管理者チェック
    if (!user) {
      router.push("/login");
      return;
    }
    if (!profile || profile.accessLevel !== "admin") {
      router.push("/");
      return;
    }

    // 出動記録を取得
    setLoading(true);
    getDispatchRecordsByOrganization(profile.organizationId)
      .then(setRecords)
      .catch((err) => {
        console.error("Failed to fetch dispatch records:", err);
      })
      .finally(() => setLoading(false));
  }, [authLoading, user, profile, router]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="クルー活動集計中..." />
        <div className="max-w-6xl mx-auto p-4">
          <p className="text-sm text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!profile || profile.accessLevel !== "admin") {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="アクセス拒否" />
        <div className="max-w-6xl mx-auto p-4">
          <p className="text-sm text-red-600">
            このページは管理者のみアクセス可能です。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="クルー別現場出動集計" />
      <ActivityDashboard
        records={records}
        organizationId={profile.organizationId}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
      />
    </div>
  );
}
