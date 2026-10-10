"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { Pin } from "@/lib/pins";
import type { LatestInfoSummary } from "@/lib/spotRecords";

export default function LatestInfoCard({ pin }: { pin: Pin }) {
  const { user } = useAuth();
  const [summary, setSummary] = useState<LatestInfoSummary | undefined>(
    pin.aiProposal?.content?.latestSummary
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/spot-latest-summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ pinId: pin.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成に失敗しました");
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="border border-blue-200 bg-blue-50/50 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">最新情報(AI集約)</h2>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 disabled:opacity-50"
        >
          {loading ? "集約中..." : summary ? "再集約" : "最新情報を集約"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {summary && (
        <div className="space-y-3 text-sm">
          <Block label="現在の最新ステータス" text={summary.currentStatus} strong />
          <Block label="経緯・変更点の要約" text={summary.changeSummary} />
          <Block label="現場取材メモ・注意事項" text={summary.fieldNotes} />
          <div>
            <p className="text-xs text-gray-500">未解決事項 / 次のアクション</p>
            {summary.openItems.length === 0 ? (
              <p>なし</p>
            ) : (
              <ul className="list-disc pl-5">
                {summary.openItems.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-[11px] text-gray-400">
            生成: {new Date(summary.generatedAt).toLocaleString("ja-JP")} ・ AIによる要約です。重要事項は原本をご確認ください
          </p>
        </div>
      )}
    </section>
  );
}

function Block({ label, text, strong }: { label: string; text: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`whitespace-pre-wrap break-words ${strong ? "font-medium" : ""}`}>{text || "記載なし"}</p>
    </div>
  );
}
