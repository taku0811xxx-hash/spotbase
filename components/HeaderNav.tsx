"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Logo from "./Logo";
import MobileMenu from "./MobileMenu";
import type { UserProfile } from "@/lib/userProfile";

interface Props {
  profile: UserProfile | null;
  onLogout: () => void;
  activeDispatchCount?: number;
}

export default function HeaderNav({ profile, onLogout, activeDispatchCount = 0 }: Props) {
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const adminMenuRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative z-50 w-full max-w-full box-border flex flex-row items-center justify-between px-3 sm:px-4 py-1.5 sm:py-2 bg-gray-900 text-white overflow-hidden" style={{ width: "100%", maxWidth: "100%" }}>
      <Link href="/" className="flex-shrink-0 min-w-0">
        <Logo className="text-white text-sm sm:text-base" />
      </Link>

      {/* Mobile Header: Status Badge + Hamburger */}
      <div className="md:hidden flex items-center gap-1 sm:gap-2 flex-shrink-0 min-w-0">
        {activeDispatchCount > 0 && (
          <span className="px-1.5 py-0.5 text-[11px] sm:text-xs bg-red-600 text-white rounded-lg font-medium whitespace-nowrap flex-shrink-0">
            🚨 出動中 {activeDispatchCount}件
          </span>
        )}
        <MobileMenu profile={profile} onLogout={onLogout} />
      </div>

      {/* Desktop Header: Full Menu */}
      <div className="hidden md:flex flex-row items-center gap-1 sm:gap-2 flex-shrink-0 relative">
        {profile && (
          <div className="text-right text-xs text-gray-300 leading-tight mr-0.5">
            <p className="text-[10px] sm:text-xs">{profile.organizationName} / {profile.category}</p>
            <p className="text-gray-400 text-[9px] sm:text-xs">
              {profile.name}
              {profile.accessLevel === "admin" && "(管理者)"}
            </p>
          </div>
        )}

        {/* 管理者メニュー（ドロップダウン） */}
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

            {/* ドロップダウンメニュー */}
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

        {/* 出動記録関連 */}
        <Link
          href="/dispatch/active"
          className="text-white text-[9px] sm:text-xs font-medium rounded-lg px-1 sm:px-2 py-0.5 sm:py-1 bg-red-600 border border-red-700 hover:bg-red-700 transition-all duration-150 whitespace-nowrap flex-shrink-0 flex items-center gap-0.5"
          title="現在対応中の案件を管理"
        >
          🚨 <span>出動中</span>
        </Link>

        <Link
          href="/dispatch"
          className="text-white text-[9px] sm:text-xs font-medium rounded-lg px-1 sm:px-2.5 py-0.5 sm:py-1.5 border border-gray-600 hover:bg-gray-800 transition-all duration-150 whitespace-nowrap flex-shrink-0 flex items-center gap-0.5"
        >
          📋 <span>記録一覧</span>
        </Link>

        <Link
          href="/dispatch/import"
          className="text-white text-[9px] sm:text-xs font-medium rounded-lg px-1 sm:px-2.5 py-0.5 sm:py-1.5 border border-gray-600 hover:bg-gray-800 transition-all duration-150 whitespace-nowrap flex-shrink-0 flex items-center gap-0.5"
        >
          📄 <span>報告書</span>
        </Link>

        <Link
          href="/dispatch/new"
          className="text-white text-[9px] sm:text-xs font-medium rounded-lg px-1 sm:px-2.5 py-0.5 sm:py-1.5 bg-red-600 shadow-sm hover:bg-red-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150 whitespace-nowrap flex-shrink-0 flex items-center gap-0.5"
        >
          + <span>出動</span>
        </Link>

        {/* ログアウト */}
        <button
          onClick={onLogout}
          className="text-gray-300 text-[9px] sm:text-xs rounded-lg px-1 sm:px-2.5 py-0.5 sm:py-1.5 hover:bg-gray-800 hover:text-white transition-all duration-150 whitespace-nowrap flex-shrink-0"
        >
          ログアウト
        </button>
      </div>
    </div>
  );
}
