"use client";

// 「ここトレ！」専用: 投稿済みの写真に対して、現地で駐車した/食事したタイミングなど
// あとから手軽に周辺情報(駐車場・飲食店メモ)を追記できるボトムシート。
// プリセットチップをタップして組み立て、1行の補足テキストを添えられる
// ミニマムな入力にし、入力負担を抑える。保存はphotos配列内の該当写真1件のみを
// 部分更新する(lib/photoSpots.ts updatePhotoNearbyInfo)。
import { useState } from "react";
import { Car, Utensils, X } from "lucide-react";
import { updatePhotoNearbyInfo } from "@/lib/photoSpots";
import { composeChipsAndText as composeValue, splitChipsAndText } from "@/lib/nearbyInfoChips";
import type { PhotoSpot, PhotoSpotPhotoItem } from "@/lib/types/photoSpot";

const PARKING_CHIPS = ["無料あり", "コインP近隣", "大型可"];
const DINING_CHIPS = ["カフェあり", "テイクアウト", "コンビニ近隣"];

type Props = {
  spot: PhotoSpot;
  photo: PhotoSpotPhotoItem;
  onClose: () => void;
  onSaved: () => void; // 保存後、呼び出し元で最新データを再取得させるためのコールバック
};

export default function PhotoNearbyInfoSheet({ spot, photo, onClose, onSaved }: Props) {
  const initialParking = splitChipsAndText(photo.parkingInfo, PARKING_CHIPS);
  const initialDining = splitChipsAndText(photo.diningInfo, DINING_CHIPS);

  const [parkingChips, setParkingChips] = useState<string[]>(initialParking.selected);
  const [parkingText, setParkingText] = useState(initialParking.text);
  const [diningChips, setDiningChips] = useState<string[]>(initialDining.selected);
  const [diningText, setDiningText] = useState(initialDining.text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleChip(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await updatePhotoNearbyInfo(spot, photo.url, {
        parkingInfo: composeValue(parkingChips, parkingText),
        diningInfo: composeValue(diningChips, diningText),
      });
      onSaved();
      onClose();
    } catch (e) {
      console.error("周辺情報の更新エラー:", e);
      setError("保存に失敗しました。時間をおいて再度お試しください");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10100] bg-black/50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-base font-bold text-gray-900">周辺情報を追加・編集</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="閉じる">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* 駐車場情報 */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
              <Car size={15} strokeWidth={2} className="text-gray-400" />
              駐車場情報
            </label>
            <div className="flex gap-2 flex-wrap mb-2">
              {PARKING_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => toggleChip(parkingChips, setParkingChips, chip)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    parkingChips.includes(chip)
                      ? "bg-orange-500 border-orange-500 text-white"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={parkingText}
              onChange={(e) => setParkingText(e.target.value)}
              placeholder="例: 公園東側のタイムズが24時間500円で一番使いやすい"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* 周辺飲食店情報 */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
              <Utensils size={15} strokeWidth={2} className="text-gray-400" />
              周辺飲食店情報
            </label>
            <div className="flex gap-2 flex-wrap mb-2">
              {DINING_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => toggleChip(diningChips, setDiningChips, chip)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    diningChips.includes(chip)
                      ? "bg-pink-500 border-pink-500 text-white"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={diningText}
              onChange={(e) => setDiningText(e.target.value)}
              placeholder="例: 歩いて2分の場所に和風カフェあり"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex justify-end gap-2 rounded-b-2xl">
          <button
            onClick={onClose}
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
        </div>
      </div>
    </div>
  );
}
