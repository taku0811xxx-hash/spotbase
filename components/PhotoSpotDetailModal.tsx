"use client";

// 「ここトレ！」マイページ専用: 自分の投稿アルバムのサムネイルをタップした際に開く
// 詳細ダイアログ。閲覧に加え、投稿者本人であればキャプション・タグ等の補足情報を
// その場で編集できる(写真・撮影場所・EXIFは編集対象外。差し替えは新規投稿で行う運用)。
import { useState } from "react";
import { Pencil, X } from "lucide-react";
import { updatePhotoSpot } from "@/lib/photoSpots";
import {
  PHOTO_SPOT_EQUIPMENT_TAGS,
  PHOTO_SPOT_SUBJECT_TAGS,
  type PhotoSpot,
  type PhotoSpotEquipmentTag,
  type PhotoSpotSubjectTag,
} from "@/lib/types/photoSpot";
import LikeSaveButtons from "@/components/LikeSaveButtons";

type Props = {
  spot: PhotoSpot;
  onClose: () => void;
  onUpdated: () => void; // 更新後、呼び出し元でギャラリーを再取得させるためのコールバック
};

export default function PhotoSpotDetailModal({ spot, onClose, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState(spot.name);
  const [description, setDescription] = useState(spot.description ?? "");
  const [accessNote, setAccessNote] = useState(spot.accessNote ?? "");
  const [subjectTags, setSubjectTags] = useState<PhotoSpotSubjectTag[]>(spot.subjectTags ?? []);
  const [equipmentTags, setEquipmentTags] = useState<PhotoSpotEquipmentTag[]>(spot.equipmentTags ?? []);
  const [isFree, setIsFree] = useState(Boolean(spot.isFree));
  const [allowCommercial, setAllowCommercial] = useState(Boolean(spot.allowCommercial));

  function toggleTag<T>(list: T[], setList: (v: T[]) => void, value: T) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await updatePhotoSpot(spot.id, {
        name: name.trim() || spot.address.trim() || "無題の写真",
        description: description.trim(),
        accessNote: accessNote.trim(),
        subjectTags,
        equipmentTags,
        isFree,
        allowCommercial,
      });
      onUpdated();
      setEditing(false);
    } catch (e) {
      console.error("PhotoSpot update error:", e);
      setError("更新に失敗しました。時間をおいて再度お試しください");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-lg font-bold text-gray-900 truncate pr-2">{editing ? "投稿を編集" : spot.name}</h2>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700 border border-orange-200 rounded-full px-3 py-1"
              >
                <Pencil size={12} strokeWidth={2} />
                編集
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="閉じる">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* 写真ギャラリー + 写真ごとのいいね/保存数 */}
          <div className="grid grid-cols-2 gap-2">
            {spot.photoUrls.map((url, i) => (
              <div key={url} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`${spot.name} ${i + 1}`} className="w-full h-full object-cover" />
                <div className="absolute bottom-1.5 right-1.5">
                  <LikeSaveButtons spotId={spot.id} url={url} size="sm" />
                </div>
              </div>
            ))}
          </div>

          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">タイトル</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="タイトル(例: ○○神社の桜並木)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">説明・構図のコツなど</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">撮影アドバイス</label>
                <textarea
                  value={accessNote}
                  onChange={(e) => setAccessNote(e.target.value)}
                  rows={2}
                  placeholder="三脚利用の可否、許可申請の要否、足場の状況など"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">被写体・タグ</p>
                <div className="flex gap-2 flex-wrap">
                  {PHOTO_SPOT_SUBJECT_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(subjectTags, setSubjectTags, tag)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        subjectTags.includes(tag)
                          ? "bg-orange-500 border-orange-500 text-white"
                          : "border-gray-300 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">機材・撮影条件</p>
                <div className="flex gap-2 flex-wrap">
                  {PHOTO_SPOT_EQUIPMENT_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(equipmentTags, setEquipmentTags, tag)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        equipmentTags.includes(tag)
                          ? "bg-pink-500 border-pink-500 text-white"
                          : "border-gray-300 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">利用条件</p>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={isFree}
                      onChange={(e) => setIsFree(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    無料ダウンロードを許可する
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={allowCommercial}
                      onChange={(e) => setAllowCommercial(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    商用利用を許可する
                  </label>
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              {spot.description && <p className="text-sm text-gray-700">{spot.description}</p>}
              <p className="text-xs text-gray-400">{spot.address}</p>
              {spot.accessNote && (
                <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{spot.accessNote}</p>
              )}
              {(spot.subjectTags?.length || spot.equipmentTags?.length) && (
                <div className="flex gap-1.5 flex-wrap">
                  {spot.subjectTags?.map((tag) => (
                    <span key={tag} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-orange-50 text-orange-600">
                      {tag}
                    </span>
                  ))}
                  {spot.equipmentTags?.map((tag) => (
                    <span key={tag} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-pink-50 text-pink-600">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex justify-end gap-2 rounded-b-2xl">
          {editing ? (
            <>
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100"
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-sm hover:shadow-md disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存する"}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100">
              閉じる
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
