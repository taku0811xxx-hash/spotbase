"use client";

// 「ここトレ！」専用: 投稿・投稿者に対する「通報」「ブロック」メニュー(3点リーダー)。
// App Store審査ガイドライン1.2(UGC)対応。自分の投稿には表示しない。
import { useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import Toast, { type ToastState } from "@/components/Toast";
import { blockUser, REPORT_REASONS, submitReport, type ReportReason } from "@/lib/moderation";

type Props = {
  spotId: string;
  postedBy: string;
  postedByName?: string;
  onRequestLogin?: () => void;
  onBlocked?: () => void; // ブロック直後(詳細を閉じる等)
};

type Step = null | "menu" | "report-post" | "report-user" | "block";

export default function ReportBlockMenu({ spotId, postedBy, postedByName, onRequestLogin, onBlocked }: Props) {
  const { photoProfile } = useAuth();
  const [step, setStep] = useState<Step>(null);
  const [reason, setReason] = useState<ReportReason>(REPORT_REASONS[0]);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  if (photoProfile && photoProfile.uid === postedBy) return null;

  function close() {
    setStep(null);
    setDetail("");
    setReason(REPORT_REASONS[0]);
  }

  function open() {
    if (!photoProfile) {
      onRequestLogin?.();
      if (!onRequestLogin) setToast({ type: "error", message: "通報・ブロックにはログインが必要です" });
      return;
    }
    setStep("menu");
  }

  async function handleReport(targetType: "post" | "user") {
    setBusy(true);
    try {
      await submitReport({
        targetType,
        targetId: targetType === "post" ? spotId : postedBy,
        targetUid: postedBy,
        reason,
        detail,
      });
      close();
      setToast({ type: "success", message: "通報を受け付けました。運営にて確認いたします" });
    } catch (e) {
      console.error("ここトレ！: 通報の送信に失敗しました", e);
      setToast({ type: "error", message: "送信に失敗しました。時間をおいて再度お試しください" });
    } finally {
      setBusy(false);
    }
  }

  async function handleBlock() {
    setBusy(true);
    try {
      await blockUser(postedBy);
      close();
      setToast({ type: "success", message: "ユーザーをブロックしました" });
      onBlocked?.();
    } catch (e) {
      console.error("ここトレ！: ブロックに失敗しました", e);
      setToast({ type: "error", message: "ブロックに失敗しました" });
    } finally {
      setBusy(false);
    }
  }

  const sheet =
    step &&
    createPortal(
      <div className="fixed inset-0 z-[10001] bg-black/50 flex items-end sm:items-center justify-center" onClick={close}>
        <div
          className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900">
              {step === "menu" && "この投稿について"}
              {step === "report-post" && "投稿を通報"}
              {step === "report-user" && "ユーザーを通報"}
              {step === "block" && "ユーザーをブロック"}
            </h3>
            <button onClick={close} aria-label="閉じる" className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>

          {step === "menu" && (
            <div className="space-y-2">
              <button onClick={() => setStep("report-post")} className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 text-sm text-gray-800">
                この投稿を通報
              </button>
              <button onClick={() => setStep("report-user")} className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 text-sm text-gray-800">
                このユーザーを通報
              </button>
              <button onClick={() => setStep("block")} className="w-full text-left px-4 py-3 rounded-lg border border-red-200 text-sm text-red-600">
                このユーザーをブロック
              </button>
            </div>
          )}

          {(step === "report-post" || step === "report-user") && (
            <>
              <div className="flex flex-wrap gap-2">
                {REPORT_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setReason(r)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full border ${
                      reason === r ? "bg-orange-500 text-white border-orange-500" : "border-gray-200 text-gray-600"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="補足があればご記入ください(任意)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <button
                onClick={() => handleReport(step === "report-post" ? "post" : "user")}
                disabled={busy}
                className="w-full rounded-lg py-2.5 text-sm font-semibold text-white bg-orange-500 disabled:opacity-50"
              >
                {busy ? "送信中..." : "通報する"}
              </button>
            </>
          )}

          {step === "block" && (
            <>
              <p className="text-sm text-gray-700">
                {postedByName ? `「${postedByName}」さんを` : "このユーザーを"}ブロックしますか？相手の投稿が表示されなくなります
              </p>
              <div className="flex gap-2">
                <button onClick={close} disabled={busy} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium">
                  キャンセル
                </button>
                <button onClick={handleBlock} disabled={busy} className="flex-1 bg-red-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">
                  {busy ? "処理中..." : "ブロックする"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>,
      document.body
    );

  return (
    <>
      <button
        onClick={open}
        aria-label="通報・ブロック"
        className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 flex items-center gap-1"
      >
        <MoreHorizontal size={18} />
      </button>
      {sheet}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
