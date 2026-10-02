"use client";

// 「ここトレ！」ホーム用: 1タップで現在地を「パーキング」「カフェ/休憩」として自分用に打刻する。
import { useState } from "react";
import { Coffee, ParkingSquare } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import QuickMemoModal from "@/components/QuickMemoModal";
import { type QuickMemoType } from "@/lib/quickMemos";

export default function QuickMemoButton({ onRequestLogin }: { onRequestLogin?: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState<QuickMemoType | null>(null);
  const [message, setMessage] = useState("");

  function start(type: QuickMemoType) {
    if (!user) {
      onRequestLogin?.();
      return;
    }
    setOpen(type);
  }

  function saved(linkedSpotId: string | null) {
    setOpen(null);
    setMessage(`自分メモに保存しました${linkedSpotId ? "(近くのスポットの周辺情報にも反映)" : ""}`);
    window.setTimeout(() => setMessage(""), 3000);
  }

  const btn = "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-700";
  return (
    <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
      <div className="flex gap-2 max-w-2xl mx-auto">
        <button onClick={() => start("parking")} className={btn}>
          <ParkingSquare size={16} className="text-blue-600" /> パーキング保存
        </button>
        <button onClick={() => start("cafe")} className={btn}>
          <Coffee size={16} className="text-amber-600" /> カフェ/休憩メモ
        </button>
      </div>
      {open && <QuickMemoModal type={open} onClose={() => setOpen(null)} onSaved={saved} />}
      {message && (
        <div role="status" className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[3100] bg-gray-800 text-white text-xs px-4 py-2 rounded-full shadow-lg">
          {message}
        </div>
      )}
    </div>
  );
}
