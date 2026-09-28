"use client";

// 「ここトレ！」ホーム用: 1タップで現在地を「パーキング」「カフェ/休憩」として自分用に打刻する。
import { useState } from "react";
import { Coffee, ParkingSquare } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { QUICK_MEMO_LABEL, stampQuickMemo, type QuickMemoType } from "@/lib/quickMemos";

export default function QuickMemoButton({ onRequestLogin }: { onRequestLogin?: () => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<QuickMemoType | null>(null);
  const [message, setMessage] = useState("");

  async function stamp(type: QuickMemoType) {
    if (!user) {
      onRequestLogin?.();
      return;
    }
    setBusy(type);
    setMessage("");
    try {
      const { linkedSpotId } = await stampQuickMemo(type);
      setMessage(`${QUICK_MEMO_LABEL[type]}を保存しました${linkedSpotId ? "(近くのスポットの周辺情報にも反映)" : ""}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(null);
      window.setTimeout(() => setMessage(""), 4000);
    }
  }

  const btn = "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 disabled:opacity-50";
  return (
    <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
      <div className="flex gap-2 max-w-2xl mx-auto">
        <button onClick={() => stamp("parking")} disabled={busy !== null} className={btn}>
          <ParkingSquare size={16} className="text-blue-600" /> {busy === "parking" ? "取得中..." : "パーキング保存"}
        </button>
        <button onClick={() => stamp("cafe")} disabled={busy !== null} className={btn}>
          <Coffee size={16} className="text-amber-600" /> {busy === "cafe" ? "取得中..." : "カフェ/休憩メモ"}
        </button>
      </div>
      {message && <p className="text-[11px] text-gray-500 text-center mt-1">{message}</p>}
    </div>
  );
}
