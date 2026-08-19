"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import PageHeader from "@/components/PageHeader";
import DispatchImportUploader from "@/components/DispatchImportUploader";

export default function DispatchImportPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="読み込み中..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="過去報告書の自動取り込み" />
      {profile && (
        <DispatchImportUploader
          organizationId={profile.organizationId}
          category={profile.category}
          recordedBy={profile.name}
        />
      )}
    </div>
  );
}
