"use client";

// スポット詳細・プラン画面用: システムが自動紐付けした「周辺の駐車場・おすすめカフェ」一覧。
import { useEffect, useState } from "react";
import { Coffee, Navigation, ParkingSquare } from "lucide-react";
import { distanceMeters, getAroundLocations, QUICK_MEMO_LABEL, type AroundLocation } from "@/lib/quickMemos";

export default function AroundLocations({ spotId, lat, lng }: { spotId: string; lat: number; lng: number }) {
  const [items, setItems] = useState<AroundLocation[]>([]);

  useEffect(() => {
    let cancelled = false;
    getAroundLocations(spotId)
      .then((r) => !cancelled && setItems(r))
      .catch((e) => console.error("ここトレ！: 周辺情報の取得に失敗しました", e));
    return () => {
      cancelled = true;
    };
  }, [spotId]);

  if (items.length === 0) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex-shrink-0">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">📍 みんなが使った周辺の駐車場・カフェ</h3>
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id} className="flex items-center gap-2 border border-gray-100 rounded-lg px-3 py-2 bg-gray-50">
            {a.type === "parking" ? <ParkingSquare size={16} className="text-blue-600" /> : <Coffee size={16} className="text-amber-600" />}
            <span className="text-sm text-gray-800">{QUICK_MEMO_LABEL[a.type]}</span>
            <span className="text-xs text-gray-400">約{Math.round(distanceMeters(lat, lng, a.lat, a.lng))}m</span>
            {a.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.photoUrl} alt={`${QUICK_MEMO_LABEL[a.type]}の写真`} loading="lazy" className="w-12 h-12 rounded object-cover" />
            )}
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-blue-600"
              aria-label="ナビを開く"
            >
              <Navigation size={16} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
