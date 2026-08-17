"use client";

type SummaryItem = { label: string; value: string };

type Props = {
  open: boolean;
  title: string;
  summary: SummaryItem[];
  confirmLabel?: string;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  summary,
  confirmLabel = "この内容で登録する",
  submitting,
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{title}</h2>
        </div>

        <div className="p-5 space-y-3">
          {summary.map((item) => (
            <div key={item.label}>
              <p className="text-xs text-gray-500">{item.label}</p>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">
                {item.value || "(未入力)"}
              </p>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-100 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 font-medium hover:bg-gray-50 hover:border-gray-400 hover:shadow-sm active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
          >
            戻る
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 font-medium shadow-sm hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {submitting ? "登録中..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
