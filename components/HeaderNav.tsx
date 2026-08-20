"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Logo from "./Logo";
import type { UserProfile } from "@/lib/userProfile";

interface Props {
  profile: UserProfile | null;
  onLogout: () => void;
}

export default function HeaderNav({ profile, onLogout }: Props) {
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const adminMenuRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative z-50 flex flex-row items-center justify-between px-2 sm:px-5 py-2 sm:py-2.5 bg-gray-900 text-white overflow-x-auto">
      <Link href="/" className="flex-shrink-0">
        <Logo className="text-white" />
      </Link>
      <div className="flex flex-row items-center gap-0.5 sm:gap-2 flex-shrink-0">
        {profile && (
          <div className="hidden sm:block text-right text-xs text-gray-300 leading-tight mr-0.5">
            <p className="text-[10px] sm:text-xs">{profile.organizationName} / {profile.category}</p>
            <p className="text-gray-400 text-[9px] sm:text-xs">
              {profile.name}
              {profile.accessLevel === "admin" && "(管理者)"}
            </p>
          </div>
        )}

        {/* 管理者メニュー（ドロップダウン） */}
        {profile?.accessLevel === "admin" && (
          <div className="relative z-50" ref={adminMenuRef}>
            <button
              onClick={() => setAdminMenuOpen(!adminMenuOpen)}
              className="text-white text-[10px] sm:text-xs font-medium rounded-lg px-1.5 sm:px-2.5 py-1 sm:py-1.5 border border-gray-600 hover:bg-gray-800 transition-all duration-150 flex items-center gap-0.5 sm:gap-1 whitespace-nowrap flex-shrink-0"
            >
              ⚙️ <span className="hidden sm:inline">管理</span>
              <span className={`text-[10px] transition-transform ${adminMenuOpen ? "rotate-180" : ""}`}>
                ▼
              </span>
            </button>

            {/* ドロップダウンメニュー */}
            {adminMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-[9999] pointer-events-auto">
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
          href="/dispatch"
          className="text-white text-[10px] sm:text-xs font-medium rounded-lg px-1.5 sm:px-2.5 py-1 sm:py-1.5 border border-gray-600 hover:bg-gray-800 transition-all duration-150 whitespace-nowrap flex-shrink-0"
        >
          📋 <span className="hidden sm:inline">出動記録一覧</span>
        </Link>

        <Link
          href="/dispatch/import"
          className="text-white text-[10px] sm:text-xs font-medium rounded-lg px-1.5 sm:px-2.5 py-1 sm:py-1.5 border border-gray-600 hover:bg-gray-800 transition-all duration-150 whitespace-nowrap flex-shrink-0"
        >
          📄 <span className="hidden sm:inline">報告書</span>
        </Link>

        <Link
          href="/dispatch/new"
          className="text-white text-[10px] sm:text-xs font-medium rounded-lg px-1.5 sm:px-2.5 py-1 sm:py-1.5 bg-red-600 shadow-sm hover:bg-red-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150 whitespace-nowrap flex-shrink-0"
        >
          + <span className="hidden sm:inline">新規出動</span>
        </Link>

        {/* ログアウト */}
        <button
          onClick={onLogout}
          className="text-gray-300 text-[10px] sm:text-xs rounded-lg px-1.5 sm:px-2.5 py-1 sm:py-1.5 hover:bg-gray-800 hover:text-white transition-all duration-150 whitespace-nowrap flex-shrink-0"
        >
          <span className="hidden sm:inline">ログアウト</span>
          <span className="sm:hidden">🚪</span>
        </button>
      </div>
    </div>
  );
}
