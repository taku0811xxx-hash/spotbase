"use client";

// 「ここトレ！」マイページ専用: 自分の撮影アルバムの写真カード(1枚)をタップした際に
// 開く詳細ダイアログ。同じスポットに複数枚投稿されていても、この詳細は常に
// タップされた1枚の写真を中心に表示する(プレビュー・いいね/保存数はその写真単位)。
// キャプション・タグ等の補足情報は投稿者本人であればその場で編集できる
// (写真・撮影場所・EXIFはPhotoSpot1件につき1組しか保持しないスキーマのため
// 編集対象外。差し替えは新規投稿で行う運用)。
import { useState } from "react";
import dynamic from "next/dynamic";
import { Aperture, Calendar, Camera, Car, Gauge, Info as InfoIcon, Pencil, Ruler, Timer, Utensils, X } from "lucide-react";
import { updatePhotoSpot } from "@/lib/photoSpots";
import {
  PHOTO_SPOT_EQUIPMENT_TAGS,
  PHOTO_SPOT_SUBJECT_TAGS,
  type PhotoSpot,
  type PhotoSpotEquipmentTag,
  type PhotoSpotPhotoItem,
  type PhotoSpotSubjectTag,
} from "@/lib/types/photoSpot";
import LikeSaveButtons from "@/components/LikeSaveButtons";

// LeafletはSSR非対応なのでクライアント側のみで読み込む
const PhotoSpotMap = dynamic(() => import("@/components/PhotoSpotMap"), { ssr: false });

type Props = {
  spot: PhotoSpot;
  // 詳細を開いた対象の写真(同じスポットに複数枚あっても、この1枚固有の
  // 位置情報・場所名・撮影条件を中心に表示する)
  photo: PhotoSpotPhotoItem;
  onClose: () => void;
  onUpdated: () => void; // 更新後、呼び出し元でギャラリーを再取得させるためのコールバック
};

function formatShotAt(shotAt: string | undefined): string | null {
  if (!shotAt) return null;
  const date = new Date(shotAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
}

export default function PhotoSpotDetailModal({ spot, photo, onClose, onUpdated }: Props) {
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
        // タイトル未入力時はこの写真の場所名を代替表示に使う。場所名も無ければ
        // 空欄のままにする(「無題の写真」等の固定文言は表示しない)。
        name: name.trim() || photo.locationName.trim(),
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

  const exif = photo.exif;
  const shotAtLabel = formatShotAt(exif?.shotAt);
  const exifRows = [
    { icon: Camera, label: [photo.cameraGear?.camera, photo.cameraGear?.lens].filter(Boolean).join(" / ") },
    { icon: Aperture, label: exif?.fNumber != null ? `F${exif.fNumber}` : null },
    { icon: Timer, label: exif?.exposureTime ? `SS ${exif.exposureTime}` : null },
    { icon: Gauge, label: exif?.iso != null ? `ISO ${exif.iso}` : null },
    { icon: Ruler, label: exif?.focalLength ? exif.focalLength : null },
    { icon: Calendar, label: shotAtLabel ?? (exif?.timeOfDay || null) },
  ].filter((row) => row.label);

  const nearbyInfoRows = [
    { icon: Car, label: photo.parkingInfo || null },
    { icon: Utensils, label: photo.diningInfo || null },
    { icon: InfoIcon, label: photo.otherInfo || null },
  ].filter((row) => row.label);

  return (
    <div className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl md:max-w-5xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-lg font-bold text-gray-900 truncate pr-2">
            {editing ? "投稿を編集" : spot.name || photo.locationName}
          </h2>
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

        {/* PC/Web版(md以上)は写真をメインにした2カラム(約65:35)、モバイルは
            従来通り縦積み(写真→補足情報)にする */}
        <div className="p-5 md:grid md:grid-cols-12 md:gap-6">
        <div className="md:col-span-8">
          {/* この写真のプレビュー: モバイルは固定高さの枠にobject-containで収め、
              PC/Web版は枠を写真の実アスペクト比に合わせて可変させ、黒帯余白を
              最小限にしつつ画面内で最大限大きく表示する(max-h-[70vh]で上限のみ設定)。
              いいね/保存数は写真の右下に重ねて表示する。 */}
          <div className="relative w-full h-64 md:h-auto md:max-h-[70vh] rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={photo.locationName || spot.name}
              className="w-full h-full md:w-auto md:h-auto md:max-w-full md:max-h-[70vh] object-contain"
            />
            <div className="absolute bottom-2 right-2">
              <LikeSaveButtons spotId={spot.id} url={photo.url} size="md" />
            </div>
          </div>
        </div>

        <div className="md:col-span-4 mt-4 md:mt-0 space-y-4">
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
            <div className="space-y-4">
              {spot.description && <p className="text-sm text-gray-700">{spot.description}</p>}
              <p className="text-xs text-gray-400">{photo.locationName}</p>
              {photo.address && photo.address !== photo.locationName && (
                <p className="text-[11px] text-gray-300">{photo.address}</p>
              )}
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

              {/* 撮影条件(EXIF)をアイコン付きで表示 */}
              {exifRows.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">撮影条件</p>
                  <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
                    {exifRows.map(({ icon: Icon, label }, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-gray-700 bg-gray-50 rounded-lg px-2.5 py-1.5">
                        <Icon size={13} strokeWidth={2} className="text-gray-400 flex-shrink-0" />
                        <span className="truncate">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 周辺情報(駐車場・飲食店・その他補足をアイコン付きで表示) */}
              {nearbyInfoRows.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">周辺情報</p>
                  <div className="space-y-1.5">
                    {nearbyInfoRows.map(({ icon: Icon, label }, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-gray-700 bg-gray-50 rounded-lg px-2.5 py-1.5">
                        <Icon size={13} strokeWidth={2} className="text-gray-400 flex-shrink-0 mt-0.5" />
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 位置情報マップ(この写真固有の緯度経度を中央に表示。周辺駐車場は
                  スポット全体に紐づく情報で写真ごとの位置とはずれうるため非表示にする) */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1.5">撮影場所</p>
                <div className="h-48 md:h-40 rounded-lg overflow-hidden border border-gray-200">
                  <PhotoSpotMap
                    spot={{
                      ...spot,
                      lat: photo.lat,
                      lng: photo.lng,
                      address: photo.address || photo.locationName,
                      parkingLots: undefined,
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
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
