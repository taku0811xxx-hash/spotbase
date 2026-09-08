"use client";

import { useEffect, useRef, useState } from "react";
import type { UserProfile } from "@/lib/userProfile";
import type { CrewStatus } from "@/lib/dummyCrew";

const STATUS_OPTIONS: CrewStatus[] = ["待機中", "移動中", "現場対応中", "帰社中"];

interface Props {
  profile: UserProfile | null;
  gpsTracking: boolean;
  gpsAcquiring?: boolean;
  onToggleGpsTracking?: () => void;
  myStatus: CrewStatus;
  onChangeStatus: (status: CrewStatus) => void;
}

// ヘッダー右側の「ユーザーステータス」ドロップダウンパネル。
// ユーザー情報の表示 + GPSトラッキングON/OFF + ステータス切替をまとめて行う。
export default function UserStatusPanel({
  profile,
  gpsTracking,
  gpsAcquiring = false,
  onToggleGpsTracking,
  myStatus,
  onChangeStatus,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const displayName = profile?.name || "ユーザー";
  const roleLabel = profile?.category || "";
  const accessLabel = profile?.accessLevel === "admin" ? "管理者" : "一般";

  return (
    <div className="relative z-[9998]" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-white text-[9px] sm:text-xs font-medium rounded-lg px-1 sm:px-2.5 py-0.5 sm:py-1.5 border border-gray-600 hover:bg-gray-800 transition-all duration-150 whitespace-nowrap flex-shrink-0"
        aria-expanded={open}
        aria-label="ユーザーステータス"
      >
        <span className="inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-blue-600 text-[8px] sm:text-[10px] font-bold flex-shrink-0">
          {displayName.slice(0, 1)}
        </span>
        <span className="hidden sm:inline max-w-[8rem] truncate">{displayName}</span>
        <span className={`text-[9px] transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-[9999] pointer-events-auto overflow-hidden">
          {/* ユーザー情報 */}
          <div className="px-4 py-3 border-b border-slate-700">
            <p className="text-sm font-semibold text-white truncate">{displayName}</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {roleLabel}
              {roleLabel && "（"}
              権限: {accessLabel}
              {roleLabel && "）"}
            </p>
            {profile?.organizationName && (
              <p className="text-[11px] text-gray-500 mt-0.5 truncate">{profile.organizationName}</p>
            )}
          </div>

          {/* GPSトラッキング ON/OFF */}
          <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs text-gray-200 font-medium">GPSトラッキング</p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {gpsAcquiring ? "測位中..." : gpsTracking ? "ON(位置情報を共有中)" : "OFF"}
              </p>
            </div>
            <button
              onClick={onToggleGpsTracking}
              disabled={gpsAcquiring}
              role="switch"
              aria-checked={gpsTracking}
              title="位置情報の自動取得(GPS追跡)を切り替え"
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 ${
                gpsAcquiring
                  ? "bg-amber-600 cursor-wait opacity-90"
                  : gpsTracking
                    ? "bg-green-600"
                    : "bg-gray-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                  gpsTracking ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* ステータス切替 */}
          <div className="px-4 py-3">
            <label className="text-xs text-gray-200 font-medium block mb-1.5" htmlFor="my-status-select">
              ステータス
            </label>
            <select
              id="my-status-select"
              value={myStatus}
              onChange={(e) => onChangeStatus(e.target.value as CrewStatus)}
              className="w-full bg-slate-800 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
