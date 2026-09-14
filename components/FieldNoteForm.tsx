"use client";

import { useState } from "react";
import {
  FIELD_NOTE_CATEGORIES,
  FIELD_NOTE_CATEGORY_META,
  type FieldNoteCategory,
} from "@/lib/fieldNotes";

interface Props {
  lat: number;
  lng: number;
  submitting: boolean;
  error?: string;
  onSubmit: (input: { category: FieldNoteCategory; comment: string }) => void;
  onClose: () => void;
  // "modal"(既定): 背景オーバーレイ付きの中央モーダルとして表示(モバイル向け)。
  // "inline": オーバーレイなしでそのまま配置できるフォーム本体のみ表示
  //   (PCのサイドパネルに埋め込む用。ヘッダー・閉じるボタンは呼び出し側で持つ)。
  variant?: "modal" | "inline";
}

// マップのダブルクリック(PC)/タップ・長押し(モバイル)、または自分の現在地ピンの
// 「この場所の情報を入力」から開く、一次情報(通行止め・現場注意・現場コメント等)
// の投稿フォーム。投稿位置(lat/lng)は呼び出し側で確定済みの状態で渡される。
export default function FieldNoteForm({
  lat,
  lng,
  submitting,
  error,
  onSubmit,
  onClose,
  variant = "modal",
}: Props) {
  const [category, setCategory] = useState<FieldNoteCategory>("closure");
  const [comment, setComment] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    onSubmit({ category, comment: comment.trim() });
  }

  const formBody = (
    <form onSubmit={handleSubmit} className="p-5 space-y-4">
      <p className="text-xs text-gray-500">
        📍 投稿位置: {lat.toFixed(5)}, {lng.toFixed(5)}
      </p>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">カテゴリ</label>
        {/* PCサイドパネル(狭幅)でもラベルが折り返さないよう、gap/paddingを詰めて
            whitespace-nowrapを指定。flex-1で3つ均等幅にしつつ、テキストは
            折り返さず縮小もしない(min-w-0を付けないことで確保)。 */}
        <div className="flex gap-1">
          {FIELD_NOTE_CATEGORIES.map((value) => {
            const meta = FIELD_NOTE_CATEGORY_META[value];
            return (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                className={`flex-1 whitespace-nowrap text-[11px] sm:text-xs rounded-lg border px-1.5 py-2 font-medium transition-colors ${
                  category === value
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {meta.emoji} {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">コメント</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          placeholder="例: 交差点手前で工事のため通行止め。迂回は北側から。"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg px-4 py-2.5 font-medium"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={submitting || !comment.trim()}
          className="flex-1 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-4 py-2.5 font-medium"
        >
          {submitting ? "投稿中..." : "投稿する"}
        </button>
      </div>
    </form>
  );

  if (variant === "inline") {
    // サイドパネル埋め込み用: オーバーレイ・ヘッダーなし、フォーム本体のみ。
    // スクロール可能な領域として振る舞えるよう、高さは親(パネル)に委ねる。
    return <div className="overflow-y-auto flex-1">{formBody}</div>;
  }

  return (
    <>
      <div className="fixed inset-0 z-[9998] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white rounded-2xl shadow-2xl max-w-sm w-full max-h-[90vh] overflow-y-auto pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between gap-2">
            <h2 className="font-bold text-lg text-gray-900">現場情報を投稿</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            >
              ✕
            </button>
          </div>
          {formBody}
        </div>
      </div>
    </>
  );
}
