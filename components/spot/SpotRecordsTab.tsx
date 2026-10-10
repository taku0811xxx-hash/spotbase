"use client";

import { APP_MODE } from "@/lib/config";
import type { Pin } from "@/lib/pins";
import ActivityLogSection from "./ActivityLogSection";
import LatestInfoCard from "./LatestInfoCard";
import ReportSection from "./ReportSection";

export default function SpotRecordsTab({ pin }: { pin: Pin }) {
  // pro専用機能(photo/walkモードでは何も描画しない)
  if (APP_MODE !== "pro") return null;
  return (
    <div className="space-y-6">
      <LatestInfoCard pin={pin} />
      <ActivityLogSection pin={pin} />
      <ReportSection pin={pin} />
    </div>
  );
}
