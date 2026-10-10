"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { APP_MODE } from "@/lib/config";
import type { Pin } from "@/lib/pins";
import {
  listActivityLogs,
  listFieldRecords,
  listReports,
  type ActivityLog,
  type FieldRecord,
  type SpotReport,
} from "@/lib/spotRecords";
import AddFieldRecordModal from "./AddFieldRecordModal";
import FieldRecordTimeline from "./FieldRecordTimeline";
import LatestInfoCard from "./LatestInfoCard";

export default function SpotRecordsTab({ pin }: { pin: Pin }) {
  const { profile } = useAuth();
  const [records, setRecords] = useState<FieldRecord[]>([]);
  const [reports, setReports] = useState<SpotReport[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    const scope = { organizationId: profile.organizationId, targetType: "pin" as const, targetId: pin.id };
    (async () => {
      try {
        const [r, rp, lg] = await Promise.all([
          listFieldRecords(pin.id, profile.organizationId),
          listReports(scope),
          listActivityLogs(scope),
        ]);
        if (cancelled) return;
        setRecords(r);
        setReports(rp);
        setLogs(lg);
        setError(null);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("現場記録の取得に失敗しました");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, pin.id, reloadKey]);

  // pro専用機能(photo/walkモードでは何も描画しない)
  if (APP_MODE !== "pro") return null;

  return (
    <div className="space-y-6">
      <LatestInfoCard pin={pin} />
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">現場記録</h2>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5"
          >
            現場記録を追加
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="text-sm text-gray-500">読み込み中...</p>
        ) : (
          <FieldRecordTimeline pin={pin} records={records} reports={reports} logs={logs} onChanged={reload} />
        )}
      </section>
      {modalOpen && (
        <AddFieldRecordModal
          pin={pin}
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
