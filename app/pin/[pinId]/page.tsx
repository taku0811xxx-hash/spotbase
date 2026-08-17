"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getPin, type Pin } from "@/lib/pins";
import PinDetail from "@/components/PinDetail";
import PageHeader from "@/components/PageHeader";

export default function PinPage() {
  const params = useParams<{ pinId: string }>();
  const [pin, setPin] = useState<Pin | null | undefined>(undefined);

  useEffect(() => {
    getPin(params.pinId).then(setPin);
  }, [params.pinId]);

  if (pin === undefined) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="読み込み中..." />
        <p className="p-4 text-sm text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (pin === null) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="見つかりません" />
        <p className="p-4 text-sm text-gray-500">
          この現場情報は見つかりませんでした。削除された可能性があります。
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title={pin.name} />
      <PinDetail pin={pin} />
    </div>
  );
}
