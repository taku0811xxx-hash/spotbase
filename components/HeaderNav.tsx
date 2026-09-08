"use client";

import { memo } from "react";
import Link from "next/link";
import Logo from "./Logo";
import UserStatusPanel from "./UserStatusPanel";
import type { UserProfile } from "@/lib/userProfile";
import type { CrewStatus } from "@/lib/dummyCrew";

interface Props {
  profile: UserProfile | null;
  onLogout: () => void;
  activeDispatchCount?: number;
  onToggleMenu?: () => void;
  gpsTracking?: boolean; // 出動中(true)/待機中(false)のGPS追跡状態
  gpsAcquiring?: boolean; // 待機中→出動中切り替え時のGPS測位中フラグ(ボタンをローディング表示・disabledにする)
  onToggleGpsTracking?: () => void;
  onNewDispatch?: () => void; // 「新規出動」クイックフロー(現場選択モーダル)を開く
  myStatus?: CrewStatus; // ユーザーステータスパネルで切り替える自分自身のステータス
  onChangeStatus?: (status: CrewStatus) => void;
}

// ヘッダーUI(PC/モバイル共通)。
// 左: ハンバーガーメニュー(既存メニュー項目はすべてここに格納) + ロゴ
// 中央/主要アクション: 「＋新規出動」「🚨出動中」のみ
// 右: ユーザーステータスパネル(ユーザー情報 / GPS ON-OFF / ステータス切替 / ログアウト)
const HeaderNav = memo(function HeaderNav({
  profile,
  onLogout,
  activeDispatchCount = 0,
  onToggleMenu,
  gpsTracking = false,
  gpsAcquiring = false,
  onToggleGpsTracking,
  onNewDispatch,
  myStatus = "待機中",
  onChangeStatus,
}: Props) {
  return (
    <div className="relative z-50 w-full max-w-full box-border flex flex-row items-center justify-between px-3 py-1.5 bg-gray-900 text-white overflow-visible gap-1">
      {/* 左: ハンバーガーメニュー + ロゴ */}
      <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
        <button
          onClick={onToggleMenu}
          className="relative z-50 flex flex-col gap-1 p-1 -ml-1 flex-shrink-0"
          title="メニュー"
          aria-label="メニューを開く"
        >
          <span className="w-5 h-0.5 bg-white transition-all duration-300" />
          <span className="w-5 h-0.5 bg-white transition-all duration-300" />
          <span className="w-5 h-0.5 bg-white transition-all duration-300" />
        </button>
        <Link href="/" className="flex-shrink-0 min-w-0">
          <Logo className="text-white text-xs" />
        </Link>
      </div>

      {/* 中央: 新規出動 + 出動中(主要アクションのみ) */}
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        {activeDispatchCount > 0 && (
          <span className="hidden sm:inline px-1.5 py-0.5 text-[10px] bg-red-600 text-white rounded-lg font-medium whitespace-nowrap flex-shrink-0">
            {activeDispatchCount}件対応中
          </span>
        )}

        {onNewDispatch && (
          <button
            onClick={onNewDispatch}
            className="text-white text-[9px] sm:text-xs font-semibold rounded-lg px-1.5 sm:px-2.5 py-0.5 sm:py-1.5 bg-blue-600 shadow-sm hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150 whitespace-nowrap flex-shrink-0"
          >
            ＋ 新規出動
          </button>
        )}

        <Link
          href="/dispatch/active"
          className="text-white text-[9px] sm:text-xs font-medium rounded-lg px-1.5 sm:px-2.5 py-0.5 sm:py-1.5 bg-red-600 border border-red-700 hover:bg-red-700 transition-all duration-150 whitespace-nowrap flex-shrink-0 flex items-center gap-0.5"
          title="現在対応中の案件を管理"
        >
          🚨 <span>出動中</span>
        </Link>
      </div>

      {/* 右: ユーザーステータスパネル */}
      <div className="flex items-center flex-shrink-0">
        <UserStatusPanel
          profile={profile}
          gpsTracking={gpsTracking}
          gpsAcquiring={gpsAcquiring}
          onToggleGpsTracking={onToggleGpsTracking}
          myStatus={myStatus}
          onChangeStatus={onChangeStatus ?? (() => {})}
        />
      </div>
    </div>
  );
});

export default HeaderNav;
