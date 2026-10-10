"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  ACTIVITY_ACTION_LABELS,
  ACTIVITY_ACTION_TYPES,
  ACTIVITY_STATUSES,
  ACTIVITY_STATUS_META,
  createFieldRecord,
  type ActivityActionType,
  type ActivityStatus,
} from "@/lib/spotRecords";
import type { Pin } from "@/lib/pins";

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm";

type Step = "choose" | "manual" | "import";

function todayInput(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 1) 方式選択 → 2) 手入力 or 報告書読み込み のステップ切り替えモーダル
export default function AddFieldRecordModal({
  pin,
  onClose,
  onCreated,
}: {
  pin: Pin;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user, profile } = useAuth();
  const [step, setStep] = useState<Step>("choose");
  const [recordDate, setRecordDate] = useState(todayInput());
  const [title, setTitle] = useState("");
  const [actorName, setActorName] = useState(profile?.name ?? "");
  const [actionType, setActionType] = useState<ActivityActionType>("contact");
  const [status, setStatus] = useState<ActivityStatus>("pending");
  const [detail, setDetail] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  // 報告書読み込み
  const [reportText, setReportText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [drafted, setDrafted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDraft() {
    if (!user || !reportText.trim()) return;
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch("/api/spot-record-draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ text: reportText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "下書きの作成に失敗しました");
      const d = data.draft as {
        recordDate: string;
        title: string;
        detail: string;
        status: ActivityStatus;
        interviewNotes: string;
      };
      if (d.recordDate) setRecordDate(d.recordDate);
      if (d.title) setTitle(d.title);
      if (d.detail) setDetail(d.detail);
      setStatus(d.status);
      if (d.interviewNotes) setInterviewNotes(d.interviewNotes);
      setDrafted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "下書きの作成に失敗しました");
    } finally {
      setDrafting(false);
    }
  }

  const canSave =
    !!recordDate &&
    !!title.trim() &&
    (step === "manual" ? !!detail.trim() : !!reportText.trim() || files.length > 0);

  async function handleSave() {
    if (!user || !profile || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      await createFieldRecord({
        pin,
        user: { uid: user.uid, name: profile.name },
        recordDate: new Date(`${recordDate}T00:00:00`),
        title: title.trim(),
        interviewNotes,
        source: step === "manual" ? "manual" : "report_import",
        activity: detail.trim()
          ? { actorName: actorName.trim(), actionType, status, detail }
          : undefined,
        report:
          step === "import"
            ? { title: title.trim(), body: reportText, files }
            : undefined,
      });
      onCreated();
    } catch (err) {
      console.error(err);
      setError("保存に失敗しました");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1900] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">現場記録を追加</h2>
          <button type="button" onClick={onClose} aria-label="閉じる" className="text-gray-500 px-2">
            ✕
          </button>
        </div>

        {step === "choose" && (
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => setStep("manual")}
              className="text-left border border-gray-200 rounded-xl p-4 hover:border-blue-400 hover:bg-blue-50/40 transition-colors"
            >
              <p className="font-medium">手入力で記録を作成</p>
              <p className="text-xs text-gray-500 mt-1">日時・取材名・対応内容・取材メモを入力します</p>
            </button>
            <button
              type="button"
              onClick={() => setStep("import")}
              className="text-left border border-gray-200 rounded-xl p-4 hover:border-blue-400 hover:bg-blue-50/40 transition-colors"
            >
              <p className="font-medium">報告書(ファイル/本文)から自動作成</p>
              <p className="text-xs text-gray-500 mt-1">
                本文を貼り付けるとAIが下書きを作成します。PDF/画像は添付として保存します
              </p>
            </button>
          </div>
        )}

        {step !== "choose" && (
          <div className="space-y-2">
            <button type="button" onClick={() => setStep("choose")} className="text-xs text-blue-600">
              ← 方式を選び直す
            </button>

            {step === "import" && (
              <div className="space-y-2">
                <textarea
                  className={inputCls}
                  rows={6}
                  placeholder="報告書の本文を貼り付け"
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                />
                <input type="file" multiple accept="application/pdf,image/*" className="text-sm" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
                <button
                  type="button"
                  onClick={handleDraft}
                  disabled={drafting || !reportText.trim()}
                  className="text-sm border border-blue-300 text-blue-700 rounded-lg px-3 py-1.5 disabled:opacity-50"
                >
                  {drafting ? "下書き作成中..." : drafted ? "下書きを作り直す" : "AIで下書きを作成"}
                </button>
                {drafted && (
                  <p className="text-xs text-amber-700">
                    AIが抽出した下書きです。内容を確認・修正してから保存してください
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="text-xs text-gray-500">
                取材日
                <input type="date" className={inputCls} value={recordDate} onChange={(e) => setRecordDate(e.target.value)} />
              </label>
              <label className="text-xs text-gray-500">
                取材名 / 目的
                <input className={inputCls} placeholder="例: 初回現地ロケ" value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <input className={inputCls} placeholder="対応者" value={actorName} onChange={(e) => setActorName(e.target.value)} />
              <select className={inputCls} value={actionType} onChange={(e) => setActionType(e.target.value as ActivityActionType)}>
                {ACTIVITY_ACTION_TYPES.map((t) => (
                  <option key={t} value={t}>{ACTIVITY_ACTION_LABELS[t]}</option>
                ))}
              </select>
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as ActivityStatus)}>
                {ACTIVITY_STATUSES.map((s) => (
                  <option key={s} value={s}>{ACTIVITY_STATUS_META[s].label}</option>
                ))}
              </select>
            </div>
            <textarea className={inputCls} rows={3} placeholder={step === "manual" ? "対応詳細" : "対応詳細(任意。入力すると対応履歴も作成)"} value={detail} onChange={(e) => setDetail(e.target.value)} />
            <textarea className={inputCls} rows={3} placeholder="取材メモ(注意事項・補足など)" value={interviewNotes} onChange={(e) => setInterviewNotes(e.target.value)} />

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg hover:bg-gray-100">
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !canSave}
                className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 disabled:opacity-50"
              >
                {saving ? "保存中..." : "記録を保存"}
              </button>
            </div>
          </div>
        )}
        {step === "choose" && error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
