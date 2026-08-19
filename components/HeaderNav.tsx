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
    <div className="flex items-center justify-between px-4 sm:px-5 py-3 bg-gray-900 text-white">
      <Logo className="text-white" />
      <div className="flex items-center gap-2 sm:gap-3">
        {profile && (
          <div className="hidden sm:block text-right text-xs text-gray-300 leading-tight mr-1">
            <p>{profile.organizationName} / {profile.category}</p>
            <p className="text-gray-400">
              {profile.name}
              {profile.accessLevel === "admin" && "(管理者)"}
            </p>
          </div>
        )}

        {/* 管理者メニュー（ドロップダウン） */}
        {profile?.accessLevel === "admin" && (
          <div className="relative" ref={adminMenuRef}>
            <button
              onClick={() => setAdminMenuOpen(!adminMenuOpen)}
              className="text-white text-sm font-medium rounded-lg px-3 py-2 border border-gray-600 hover:bg-gray-800 transition-all duration-150 flex items-center gap-1"
            >
              ⚙️ 管理
              <span className={`text-xs transition-transform ${adminMenuOpen ? "rotate-180" : ""}`}>
                ▼
              </span>
            </button>

            {/* ドロップダウンメニュー */}
            {adminMenuOpen && (
              <div className="absolute right-0 mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-50">
                <Link
                  href="/admin/users"
                  className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white first:rounded-t-lg transition-colors"
                  onClick={() => setAdminMenuOpen(false)}
                >
                  👤 ユーザー管理
                </Link>
                <Link
                  href="/admin/activity"
                  className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                  onClick={() => setAdminMenuOpen(false)}
                >
                  📊 クルー別集計
                </Link>
                <Link
                  href="/admin/backup"
                  className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white last:rounded-b-lg transition-colors"
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
          className="text-white text-sm font-medium rounded-lg px-3 py-2 border border-gray-600 hover:bg-gray-800 transition-all duration-150"
        >
          📋 一覧
        </Link>

        <Link
          href="/dispatch/import"
          className="text-white text-sm font-medium rounded-lg px-3 py-2 border border-gray-600 hover:bg-gray-800 transition-all duration-150"
        >
          📄 インポート
        </Link>

        <Link
          href="/dispatch/new"
          className="text-white text-sm font-medium rounded-lg px-4 py-2 bg-red-600 shadow-sm hover:bg-red-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150"
        >
          + 新規
        </Link>

        {/* ログアウト */}
        <button
          onClick={onLogout}
          className="text-gray-300 text-sm rounded-lg px-3 py-2 hover:bg-gray-800 hover:text-white transition-all duration-150"
        >
          ログアウト
        </button>
      </div>
    </div>
  );
}
