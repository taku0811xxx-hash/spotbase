"use client";

import { useRef, useState, memo } from "react";
import Link from "next/link";
import Logo from "./Logo";
import type { UserProfile } from "@/lib/userProfile";

interface Props {
  profile: UserProfile | null;
  onLogout: () => void;
  activeDispatchCount?: number;
  onToggleMenu?: () => void;
  gpsTracking?: boolean; // 出動中(true)/待機中(false)のGPS追跡状態
  onToggleGpsTracking?: () => void;
  onNewDispatch?: () => void; // 「新規出動」クイックフロー(現場選択モーダル)を開く
}

// GPS追跡のON/OFFを切り替えるステータスボタン。
// 絵文字は使わず、テキストとカラーリングのみで状態を表現する。
function GpsStatusToggle({
  gpsTracking,
  onToggleGpsTracking,
  compact = false,
}: {
  gpsTracking: boolean;
  onToggleGpsTracking?: () => void;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onToggleGpsTracking}
      title="位置情報の自動取得(GPS追跡)を切り替え"
      aria-pressed={gpsTracking}
      className={`font-semibold rounded-lg border whitespace-nowrap flex-shrink-0 transition-all duration-150 ${
        compact ? "text-[9px] px-1.5 py-0.5" : "text-[9px] sm:text-xs px-1.5 sm:px-2.5 py-0.5 sm:py-1.5"
      } ${
        gpsTracking
          ? "bg-green-600 border-green-700 text-white hover:bg-green-700"
          : "bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600"
      }`}
    >
      {gpsTracking ? "出動中 [GPS ON]" : "待機中 [GPS OFF]"}
    </button>
  );
}

const HeaderNav = memo(function HeaderNav({
  profile,
  onLogout,
  activeDispatchCount = 0,
  onToggleMenu,
  gpsTracking = false,
  onToggleGpsTracking,
  onNewDispatch,
}: Props) {
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const adminMenuRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative z-50 w-full max-w-full box-border flex flex-row items-center justify-between px-3 py-1.5 bg-gray-900 text-white overflow-visible">
      <Link href="/" className="flex-shrink-0 min-w-0">
        <Logo className="text-white text-xs" />
      </Link>

      {/* Mobile Header: Status Badge + GPS Toggle + Hamburger */}
      <div className="md:hidden flex items-center gap-1 flex-shrink-0 min-w-0">
        {activeDispatchCount > 0 && (
          <span className="px-1.5 py-0.5 text-[10px] bg-red-600 text-white rounded-lg font-medium whitespace-nowrap flex-shrink-0">
            🚨 {activeDispatchCount}件
          </span>
        )}
        <GpsStatusToggle gpsTracking={gpsTracking} onToggleGpsTracking={onToggleGpsTracking} compact />
        {onNewDispatch && (
          <button
            onClick={onNewDispatch}
            className="text-[9px] px-1.5 py-0.5 bg-blue-600 text-white rounded-lg font-semibold whitespace-nowrap flex-shrink-0 hover:bg-blue-700 transition-colors"
          >
            新規出動
          </button>
        )}
        {/* Hamburger Button - Menu Portal でレンダリングされるメニューを開く */}
        <button
          onClick={onToggleMenu}
          className="md:hidden relative z-50 flex flex-col gap-1 p-1 -mr-1"
          title="メニュー"
          aria-label="メニューを開く"
        >
          <span className="w-6 h-0.5 bg-white transition-all duration-300" />
          <span className="w-6 h-0.5 bg-white transition-all duration-300" />
          <span className="w-6 h-0.5 bg-white transition-all duration-300" />
        </button>
      </div>

      {/* Desktop Header: Full Menu
          並び順(左→右): GPSステータス → 新規出動 → 出動中 → 過去出動記録 → 報告書
          → ユーザー名/組織情報+管理メニュー → ログアウト */}
      <div className="hidden md:flex flex-row items-center gap-1 sm:gap-2 flex-shrink-0 relative">
        {/* 1. GPSステータス */}
        <GpsStatusToggle gpsTracking={gpsTracking} onToggleGpsTracking={onToggleGpsTracking} />

        {/* 2. 新規出動 */}
        {onNewDispatch && (
          <button
            onClick={onNewDispatch}
            className="text-white text-[9px] sm:text-xs font-semibold rounded-lg px-1.5 sm:px-2.5 py-0.5 sm:py-1.5 bg-blue-600 shadow-sm hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150 whitespace-nowrap flex-shrink-0"
          >
            新規出動
          </button>
        )}

        {/* 3. 出動中 */}
        <Link
          href="/dispatch/active"
          className="text-white text-[9px] sm:text-xs font-medium rounded-lg px-1 sm:px-2 py-0.5 sm:py-1 bg-red-600 border border-red-700 hover:bg-red-700 transition-all duration-150 whitespace-nowrap flex-shrink-0 flex items-center gap-0.5"
          title="現在対応中の案件を管理"
        >
          🚨 <span>出動中</span>
        </Link>

        {/* 4. 過去出動記録 */}
        <Link
          href="/dispatch"
          title="蓄積された出動記録の一覧を確認する"
          className="text-white text-[9px] sm:text-xs font-medium rounded-lg px-1 sm:px-2.5 py-0.5 sm:py-1.5 border border-gray-600 hover:bg-gray-800 transition-all duration-150 whitespace-nowrap flex-shrink-0 flex items-center gap-0.5"
        >
          📋 <span>出動記録</span>
        </Link>

        {/* 5. 報告書 */}
        <Link
          href="/dispatch/import"
          className="text-white text-[9px] sm:text-xs font-medium rounded-lg px-1 sm:px-2.5 py-0.5 sm:py-1.5 border border-gray-600 hover:bg-gray-800 transition-all duration-150 whitespace-nowrap flex-shrink-0 flex items-center gap-0.5"
        >
          📄 <span>報告書</span>
        </Link>

        {/* 6. ユーザー名/組織情報 + 管理メニュー */}
        {profile && (
          <div className="text-right text-xs text-gray-300 leading-tight mr-0.5">
            <p className="text-[10px] sm:text-xs">{profile.organizationName} / {profile.category}</p>
            <p className="text-gray-400 text-[9px] sm:text-xs">
              {profile.name}
              {profile.accessLevel === "admin" && "(管理者)"}
            </p>
          </div>
        )}

        {profile?.accessLevel === "admin" && (
          <div className="relative z-[9998]" ref={adminMenuRef}>
            <button
              onClick={() => setAdminMenuOpen(!adminMenuOpen)}
              className="text-white text-[9px] sm:text-xs font-medium rounded-lg px-1 sm:px-2.5 py-0.5 sm:py-1.5 border border-gray-600 hover:bg-gray-800 transition-all duration-150 flex items-center gap-0.5 whitespace-nowrap flex-shrink-0"
            >
              ⚙️ <span>管理</span>
              <span className={`text-[9px] transition-transform ${adminMenuOpen ? "rotate-180" : ""}`}>
                ▼
              </span>
            </button>

            {/* ドロップダウンメニュー - 下のコンテンツより必ず前面に表示されるようz-[9999]を指定 */}
            {adminMenuOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-[9999] pointer-events-auto overflow-visible">
                <Link
                  href="/admin/users"
                  className="block px-4 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white first:rounded-t-lg transition-colors"
                  onClick={() => setAdminMenuOpen(false)}
                >
                  👤 ユーザー管理
                </Link>
                <Link
                  href="/admin/activity"
                  className="block px-4 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                  onClick={() => setAdminMenuOpen(false)}
                >
                  📊 クルー別集計
                </Link>
                <Link
                  href="/admin/backup"
                  className="block px-4 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white last:rounded-b-lg transition-colors"
                  onClick={() => setAdminMenuOpen(false)}
                >
                  💾 バックアップ
                </Link>
              </div>
            )}
          </div>
        )}

        {/* 7. ログアウト */}
        <button
          onClick={onLogout}
          className="text-gray-300 text-[9px] sm:text-xs rounded-lg px-1 sm:px-2.5 py-0.5 sm:py-1.5 hover:bg-gray-800 hover:text-white transition-all duration-150 whitespace-nowrap flex-shrink-0"
        >
          ログアウト
        </button>
      </div>
    </div>
  );
});

export default HeaderNav;
