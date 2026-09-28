"use client";

// 「ここトレ！」プランタブ本体。
// Step1: スポット選択(保存済み/今月のおすすめ) → Step2: 狙える作例 →
// Step3: 機材チェックリスト → Step4: タイムスケジュール+Googleマップナビ。
import { useEffect, useMemo, useState } from "react";
import { Calendar, Camera, CheckSquare, Clock, ChevronLeft, Navigation, Square } from "lucide-react";
import AroundLocations from "@/components/AroundLocations";
import { useAuth } from "@/components/AuthProvider";
import { getAllPhotoSpots, getPhotoSpotPhotos, filterVisibleSpots } from "@/lib/photoSpots";
import { useSavedPhotoKeys } from "@/lib/hooks/usePhotoInteractions";
import { getSunTimes } from "@/lib/sunCalc";
import type { PhotoSpot } from "@/lib/types/photoSpot";
import { getSpotTitle } from "@/lib/spotTitle";

// 撮影月(EXIFのshotAt優先、なければ投稿日)。0始まりではなく1〜12。
function spotMonths(spot: PhotoSpot): number[] {
  const months = new Set<number>();
  for (const p of getPhotoSpotPhotos(spot)) {
    const d = p.exif?.shotAt ? new Date(p.exif.shotAt) : null;
    if (d && !isNaN(d.getTime())) months.add(d.getMonth() + 1);
  }
  if (months.size === 0 && spot.postedAt) {
    const d = new Date(spot.postedAt);
    if (!isNaN(d.getTime())) months.add(d.getMonth() + 1);
  }
  return [...months];
}

// "1/250" → 0.004 / "2" → 2 (秒)
function parseShutter(s?: string): number | null {
  if (!s) return null;
  const [a, b] = s.replace("s", "").split("/");
  const n = b ? Number(a) / Number(b) : Number(a);
  return isFinite(n) && n > 0 ? n : null;
}

function focalMm(s?: string): number | null {
  const n = parseFloat(s ?? "");
  return isFinite(n) ? n : null;
}

function buildGearList(spot: PhotoSpot): { item: string; reason: string }[] {
  const photos = getPhotoSpotPhotos(spot);
  const exifs = photos.map((p) => p.exif).filter(Boolean);
  const longExposure = exifs.some((e) => (parseShutter(e?.exposureTime) ?? 0) >= 0.5);
  const tele = exifs.some((e) => (focalMm(e?.focalLength) ?? 0) >= 85) || spot.equipmentTags?.includes("望遠");
  const wide = exifs.some((e) => {
    const f = focalMm(e?.focalLength);
    return f !== null && f <= 24;
  }) || spot.equipmentTags?.includes("広角");
  const night =
    exifs.some((e) => e?.timeOfDay === "夜景") || spot.subjectTags?.includes("夜景");
  const list: { item: string; reason: string }[] = [];
  if (longExposure || night || spot.equipmentTags?.includes("三脚使用可")) list.push({ item: "三脚", reason: "長秒露光・夜景向き" });
  if (longExposure) list.push({ item: "NDフィルター", reason: "長秒露光の作例あり" });
  if (night) list.push({ item: "レリーズ / リモコン", reason: "ブレ防止" }, { item: "懐中電灯", reason: "暗所での足元・操作用" });
  if (tele) list.push({ item: "望遠レンズ", reason: "望遠での作例あり" });
  if (wide) list.push({ item: "広角レンズ", reason: "広角での作例あり" });
  list.push({ item: "予備バッテリー", reason: "必携" }, { item: "SDカード", reason: "必携" });
  return list;
}

function fmt(d: Date | null): string {
  return d ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "--:--";
}

function buildTimeline(spot: PhotoSpot): { time: string; label: string }[] {
  let day = new Date();
  let t = getSunTimes(day, spot.lat, spot.lng);
  if (t.sunset && t.sunset.getTime() < Date.now()) {
    day = new Date(day.getTime() + 86400000);
    t = getSunTimes(day, spot.lat, spot.lng);
  }
  const shift = (d: Date | null, min: number) => (d ? new Date(d.getTime() + min * 60000) : null);
  const golden = t.goldenHourEveningStart ?? shift(t.sunset, -60);
  return [
    { time: fmt(shift(golden, -30)), label: "現地到着・機材セッティング" },
    { time: fmt(golden), label: "ゴールデンアワー開始" },
    { time: fmt(t.sunset), label: "日没" },
    { time: fmt(t.duskBlueHourStart), label: "マジックアワー(ブルーアワー)開始" },
    { time: fmt(t.duskBlueHourEnd), label: "撮影終了の目安" },
  ];
}

function navUrl(spot: PhotoSpot): string {
  const lot = spot.parkingLots?.find((l) => l.lat != null && l.lng != null);
  const dest = lot ? `${lot.lat},${lot.lng}` : `${spot.lat},${spot.lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
}

export default function PlanView() {
  const { user } = useAuth();
  const savedKeys = useSavedPhotoKeys();
  const [spots, setSpots] = useState<PhotoSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<PhotoSpot | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    getAllPhotoSpots()
      .then(setSpots)
      .catch((e) => console.error("ここトレ！: スポット取得に失敗しました", e))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => filterVisibleSpots(spots, user?.uid), [spots, user]);
  const month = new Date().getMonth() + 1;
  const savedIds = useMemo(() => new Set(savedKeys.map((k) => k.split(":")[0])), [savedKeys]);
  const savedSpots = useMemo(() => visible.filter((s) => savedIds.has(s.id)), [visible, savedIds]);
  const mine = useMemo(() => visible.filter((s) => user && s.postedBy === user.uid), [visible, user]);
  const seasonal = useMemo(() => visible.filter((s) => spotMonths(s).includes(month)), [visible, month]);

  function pick(spot: PhotoSpot) {
    setSelected(spot);
    setChecked(new Set());
    setStep(2);
  }

  const card = "bg-white rounded-xl border border-gray-100 shadow-sm";
  const SpotRow = ({ spot }: { spot: PhotoSpot }) => (
    <button onClick={() => pick(spot)} className={`${card} w-full flex items-center gap-3 p-2 text-left`}>
      {spot.photoUrls[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={spot.photoUrls[0]} alt={getSpotTitle(spot)} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{getSpotTitle(spot)}</p>
        <p className="text-[11px] text-gray-400 truncate">{spot.address}</p>
      </div>
    </button>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Calendar size={18} className="text-orange-500" /> 撮影プラン
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">スポット選び〜機材〜当日の時間割までをまとめて準備</p>
      </div>

      {step > 1 && selected && (
        <div className="flex items-center gap-2">
          <button onClick={() => setStep(step - 1)} className="text-gray-500 flex items-center text-xs font-semibold">
            <ChevronLeft size={16} /> 戻る
          </button>
          <span className="text-xs text-gray-400">Step {step}/4 ・ {getSpotTitle(selected)}</span>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          {loading && <p className="text-sm text-gray-400 text-center py-6">読み込み中...</p>}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-gray-800">🍂 {month}月におすすめの人気撮影スポット</h3>
            {seasonal.length === 0 ? (
              <p className="text-xs text-gray-400">この時期に撮影された投稿はまだありません。</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                {seasonal.slice(0, 12).map((s) => (
                  <button key={s.id} onClick={() => pick(s)} className={`${card} w-40 flex-shrink-0 overflow-hidden text-left`}>
                    {s.photoUrls[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.photoUrls[0]} alt={getSpotTitle(s)} className="w-full h-24 object-cover" />
                    )}
                    <div className="p-2">
                      <p className="text-xs font-semibold text-gray-800 truncate">{getSpotTitle(s)}</p>
                      <p className="text-[10px] text-orange-500">今が旬</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
          {[
            { title: "🔖 保存したスポット", list: savedSpots },
            { title: "📷 マイ投稿", list: mine },
          ].map(
            ({ title, list }) =>
              list.length > 0 && (
                <section key={title} className="space-y-2">
                  <h3 className="text-sm font-bold text-gray-800">{title}</h3>
                  {list.map((s) => (
                    <SpotRow key={s.id} spot={s} />
                  ))}
                </section>
              )
          )}
        </div>
      )}

      {step === 2 && selected && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
            <Camera size={16} /> 狙える作例・アングル
          </h3>
          {getPhotoSpotPhotos(selected).map((p, i) => (
            <div key={i} className={`${card} overflow-hidden`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.locationName} className="w-full h-44 object-cover" />
              <div className="p-3 text-xs text-gray-600 flex flex-wrap gap-x-3 gap-y-1">
                {p.exif?.focalLength && <span>焦点距離 {p.exif.focalLength}</span>}
                {p.exif?.fNumber && <span>F{p.exif.fNumber}</span>}
                {p.exif?.exposureTime && <span>SS {p.exif.exposureTime}</span>}
                {p.exif?.iso && <span>ISO {p.exif.iso}</span>}
                {p.exif?.timeOfDay && <span>{p.exif.timeOfDay}</span>}
                {p.memo && <p className="w-full text-gray-500">{p.memo}</p>}
              </div>
            </div>
          ))}
          <button onClick={() => setStep(3)} className="w-full py-2.5 text-sm font-semibold rounded-lg bg-orange-500 text-white">
            次へ: 必要機材
          </button>
        </div>
      )}

      {step === 3 && selected && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-800">持ち物チェックリスト</h3>
          {buildGearList(selected).map(({ item, reason }) => {
            const on = checked.has(item);
            return (
              <button
                key={item}
                onClick={() => {
                  const next = new Set(checked);
                  if (on) next.delete(item);
                  else next.add(item);
                  setChecked(next);
                }}
                className={`${card} w-full flex items-center gap-3 p-3 text-left`}
              >
                {on ? <CheckSquare size={20} className="text-orange-500" /> : <Square size={20} className="text-gray-300" />}
                <span className={`text-sm ${on ? "line-through text-gray-400" : "text-gray-800"}`}>{item}</span>
                <span className="ml-auto text-[10px] text-gray-400">{reason}</span>
              </button>
            );
          })}
          <button onClick={() => setStep(4)} className="w-full py-2.5 text-sm font-semibold rounded-lg bg-orange-500 text-white">
            次へ: タイムスケジュール
          </button>
        </div>
      )}

      {step === 4 && selected && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
            <Clock size={16} /> 当日のタイムスケジュール(目安)
          </h3>
          <div className={`${card} p-4 space-y-3`}>
            {buildTimeline(selected).map(({ time, label }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-sm font-bold text-orange-600 w-14 tabular-nums">{time}</span>
                <span className="text-sm text-gray-700">{label}</span>
              </div>
            ))}
            <p className="text-[10px] text-gray-400">現地への移動時間を考慮し、余裕を持って出発してください。</p>
          </div>
          <AroundLocations spotId={selected.id} lat={selected.lat} lng={selected.lng} />
          <a
            href={navUrl(selected)}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold rounded-lg bg-blue-600 text-white"
          >
            <Navigation size={16} /> Googleマップでナビを開始
          </a>
        </div>
      )}
    </div>
  );
}
