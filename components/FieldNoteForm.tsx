"use client";

import { useState } from "react";
import {
  FIELD_NOTE_CATEGORIES,
  FIELD_NOTE_CATEGORY_META,
  FIELD_NOTE_TAG_OPTIONS,
  type FieldNoteCategory,
} from "@/lib/fieldNotes";

interface Props {
  lat: number;
  lng: number;
  submitting: boolean;
  error?: string;
  onSubmit: (input: {
    category: FieldNoteCategory;
    comment: string;
    tags?: string[];
    contactInfo?: string;
  }) => void;
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
  const [category, setCategory] = useState<FieldNoteCategory>("location");
  const [comment, setComment] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [contactInfo, setContactInfo] = useState("");

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    onSubmit({
      category,
      comment: comment.trim(),
      tags: selectedTags,
      contactInfo: contactInfo.trim() || undefined,
    });
  }

  const formBody = (
    <form onSubmit={handleSubmit} className="p-5 space-y-4">
      <p className="text-xs text-gray-500">
        📍 投稿位置: {lat.toFixed(5)}, {lng.toFixed(5)}
      </p>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">カテゴリ</label>
        {/* アイコン・絵文字は使わず、テキストのみのミニマルなセグメントコントロールにする。
            選択中はダークネイビー、未選択はライトグレー背景+境界線のみで区別する。
            PCサイドパネル(狭幅)でもラベルが折り返さないよう2列グリッドで均等配置。 */}
        <div className="grid grid-cols-2 gap-1">
          {FIELD_NOTE_CATEGORIES.map((value) => {
            const meta = FIELD_NOTE_CATEGORY_META[value];
            return (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                className={`whitespace-nowrap text-[11px] sm:text-xs rounded-md border px-1.5 py-2 font-medium tracking-wide transition-colors ${
                  category === value
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">タグ(任意)</label>
        {/* こちらもアイコンなし、テキストのみのピル型タグ。トーン・オン・トーンの
            淡い配色で統一し、派手な色分けはしない。 */}
        <div className="flex flex-wrap gap-1.5">
          {FIELD_NOTE_TAG_OPTIONS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`text-[11px] sm:text-xs rounded-full border px-2.5 py-1 font-medium transition-colors ${
                selectedTags.includes(tag)
                  ? "bg-slate-700 text-white border-slate-700"
                  : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">
          コメント・ロケハンメモ
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          placeholder="例: 交差点手前の駐車スペース。ロケバス2台まで駐車可、屋根なし。"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">
          許諾先・担当者メモ(任意)
        </label>
        <input
          type="text"
          value={contactInfo}
          onChange={(e) => setContactInfo(e.target.value)}
          placeholder="例: 施設管理事務所 03-xxxx-xxxx、要事前申請"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
