"use client";

// マイページ「自分メモ」タブ: 自分のパーキング履歴・立ち寄りメモの一覧(本人のみ閲覧可)と、
// 周辺情報としての匿名共有のON/OFF。
import { useEffect, useState } from "react";
import { Coffee, MapPin, ParkingSquare, Trash2 } from "lucide-react";
import {
  deleteQuickMemo,
  getMyQuickMemos,
  getShareAround,
  QUICK_MEMO_LABEL,
  setShareAround,
  type QuickMemo,
} from "@/lib/quickMemos";

export default function QuickMemoList() {
  const [memos, setMemos] = useState<QuickMemo[]>([]);
  const [loading, setLoading] = useState(true);
  const [share, setShare] = useState(true);

  useEffect(() => {
    getShareAround().then(setShare);
    getMyQuickMemos()
      .then(setMemos)
      .catch((e) => console.error("ここトレ！: 自分メモの取得に失敗しました", e))
      .finally(() => setLoading(false));
  }, []);

  async function remove(id: string) {
    await deleteQuickMemo(id);
    setMemos((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 bg-white rounded-xl border border-gray-200 p-3 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={share}
          onChange={(e) => {
            setShare(e.target.checked);
            setShareAround(e.target.checked);
          }}
          className="mt-0.5"
        />
        <span>
          打刻した場所を、近くの撮影スポットの「周辺の駐車場・カフェ」として匿名で共有する
          <br />
          <span className="text-gray-400">(ユーザー名・日時は含まれません。共有済みの分は後から取り消せません)</span>
        </span>
      </label>
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">読み込み中...</p>
      ) : memos.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          まだメモがありません。ホーム上部の「パーキング保存」「カフェ/休憩メモ」で打刻できます。
        </p>
      ) : (
        memos.map((m) => (
          <div key={m.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
            {m.type === "parking" ? <ParkingSquare size={20} className="text-blue-600" /> : <Coffee size={20} className="text-amber-600" />}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800">{QUICK_MEMO_LABEL[m.type]}</p>
              <p className="text-[11px] text-gray-400">{m.createdAt ? m.createdAt.toLocaleString("ja-JP") : ""}</p>
            </div>
            {m.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.photoUrl} alt="メモの写真" loading="lazy" className="w-10 h-10 rounded object-cover ml-auto" />
            )}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${m.photoUrl ? "" : "ml-auto "}text-gray-500`}
              aria-label="地図で見る"
            >
              <MapPin size={18} />
            </a>
            <button onClick={() => remove(m.id)} className="text-gray-300 hover:text-red-500" aria-label="削除">
              <Trash2 size={18} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
