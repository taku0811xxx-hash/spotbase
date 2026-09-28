"use client";

// 「ここトレ！」撮影準備タブ専用: 選択したスポット(または現在地)における
// 日の出・日の入り・ゴールデンアワー/マジックアワーの目安時刻と、現在の
// 太陽の方位・高度(順光/逆光の把握用)を表示する。
import { useEffect, useState } from "react";
import { Navigation2, Sunrise, Sunset } from "lucide-react";
import { azimuthToCompassLabel, getSunPosition, getSunTimes } from "@/lib/sunCalc";
import type { PhotoSpot } from "@/lib/types/photoSpot";

type Props = {
  // SpotPlannerタブから選ばれたスポット(未選択時は現在地を使う)
  spot: PhotoSpot | null;
};

function formatTime(date: Date | null): string {
  if (!date) return "―";
  return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function formatRange(start: Date | null, end: Date | null): string {
  if (!start || !end) return "―";
  return `${formatTime(start)} 〜 ${formatTime(end)}`;
}

export default function EnvironmentData({ spot }: Props) {
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState("");
  const [now, setNow] = useState(() => new Date());

  // 太陽の方位・高度は時々刻々変わるため、1分おきに再計算する
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  function useCurrentLocation() {
    setGeoError("");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("この端末では現在地を取得できません");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoError("現在地の取得に失敗しました。位置情報の許可をご確認ください"),
      { timeout: 8000 }
    );
  }

  const location = spot ? { lat: spot.lat, lng: spot.lng } : currentLocation;

  if (!location) {
    return (
      <div className="space-y-3 text-center py-8">
        <p className="text-sm text-gray-500">
          「場所」タブでスポットを選ぶか、現在地を使って日照・太陽方位を確認できます
        </p>
        <button
          onClick={useCurrentLocation}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-sm"
        >
          現在地を使う
        </button>
        {geoError && <p className="text-xs text-red-500">{geoError}</p>}
      </div>
    );
  }

  const sunTimes = getSunTimes(now, location.lat, location.lng);
  const sunPosition = getSunPosition(now, location.lat, location.lng);
  const isDaytime = sunPosition.altitude > 0;

  return (
    <div className="space-y-4">
      {spot ? (
        <p className="text-xs text-gray-500 truncate">📍 {spot.name || spot.address}</p>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-gray-500">📍 現在地</p>
          <button onClick={useCurrentLocation} className="text-[11px] font-semibold text-orange-600">
            更新
          </button>
        </div>
      )}
      {geoError && <p className="text-xs text-red-500">{geoError}</p>}

      {/* 日の出・日の入り */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-50 rounded-lg px-3 py-2.5 flex items-center gap-2">
          <Sunrise size={16} strokeWidth={2} className="text-orange-400 flex-shrink-0" />
          <div>
            <p className="text-[10px] text-gray-400">日の出</p>
            <p className="text-sm font-semibold text-gray-800">{formatTime(sunTimes.sunrise)}</p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg px-3 py-2.5 flex items-center gap-2">
          <Sunset size={16} strokeWidth={2} className="text-indigo-400 flex-shrink-0" />
          <div>
            <p className="text-[10px] text-gray-400">日の入り</p>
            <p className="text-sm font-semibold text-gray-800">{formatTime(sunTimes.sunset)}</p>
          </div>
        </div>
      </div>

      {/* ゴールデンアワー/マジックアワー */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-gray-500">ゴールデンアワー(柔らかい順光)</p>
        <p className="text-xs text-gray-700 bg-orange-50 rounded-lg px-3 py-2">
          朝: {formatRange(sunTimes.sunrise, sunTimes.goldenHourMorningEnd)}
          <br />
          夕: {formatRange(sunTimes.goldenHourEveningStart, sunTimes.sunset)}
        </p>
        <p className="text-xs font-semibold text-gray-500">マジックアワー/ブルーアワー</p>
        <p className="text-xs text-gray-700 bg-indigo-50 rounded-lg px-3 py-2">
          朝: {formatRange(sunTimes.dawnBlueHourEnd, sunTimes.dawnBlueHourStart)}
          <br />
          夕: {formatRange(sunTimes.duskBlueHourStart, sunTimes.duskBlueHourEnd)}
        </p>
      </div>

      {/* 現在の太陽方位・高度(順光/逆光の把握用の簡易コンパス) */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-1.5">現在の太陽の方角(順光/逆光の目安)</p>
        <div className="flex items-center gap-4 bg-gray-50 rounded-lg px-4 py-3">
          <svg viewBox="0 0 100 100" className="w-20 h-20 flex-shrink-0">
            <circle cx="50" cy="50" r="46" fill="white" stroke="#e5e7eb" strokeWidth="2" />
            <text x="50" y="14" textAnchor="middle" fontSize="9" fill="#9ca3af">北</text>
            <text x="90" y="53" textAnchor="middle" fontSize="9" fill="#9ca3af">東</text>
            <text x="50" y="94" textAnchor="middle" fontSize="9" fill="#9ca3af">南</text>
            <text x="10" y="53" textAnchor="middle" fontSize="9" fill="#9ca3af">西</text>
            {isDaytime && (
              <g
                transform={`rotate(${sunPosition.azimuth} 50 50)`}
              >
                <circle cx="50" cy="14" r="6" fill="#f97316" />
                <line x1="50" y1="50" x2="50" y2="22" stroke="#f97316" strokeWidth="2" />
              </g>
            )}
          </svg>
          <div className="flex-1">
            {isDaytime ? (
              <>
                <p className="text-sm font-semibold text-gray-800">
                  <Navigation2 size={13} className="inline -mt-0.5 mr-1 text-orange-500" />
                  {azimuthToCompassLabel(sunPosition.azimuth)}方向・高度{Math.round(sunPosition.altitude)}°
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  太陽を背にすると順光、太陽に向かうと逆光になります
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">現在、太陽は地平線の下です(夜間)</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
