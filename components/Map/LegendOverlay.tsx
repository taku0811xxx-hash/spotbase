"use client";

interface Props {
  show?: boolean;
}

export default function LegendOverlay({ show = false }: Props) {
  if (!show) {
    return null;
  }

  return (
    <div className="absolute top-3 right-3 z-[1000] bg-white/90 backdrop-blur-sm p-2.5 rounded-lg shadow-md border border-slate-200">
      <div className="space-y-1.5">
        {/* タイトル */}
        <div className="font-semibold text-xs text-slate-900 mb-1.5">
          待機・車寄せエリア
        </div>

        {/* 降機材（車寄せ）スポット */}
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-600 flex-shrink-0" />
          <span className="text-xs text-slate-700">降機材（車寄せ）</span>
        </div>

        {/* 乗車待機推奨ライン */}
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-green-500 flex-shrink-0" />
          <span className="text-xs text-slate-700">乗車待機エリア</span>
        </div>
      </div>
    </div>
  );
}
