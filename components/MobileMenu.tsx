"use client";

import { useState } from "react";
import Link from "next/link";
import type { UserProfile } from "@/lib/userProfile";

interface Props {
  profile: UserProfile | null;
  onLogout: () => void;
}

export default function MobileMenu({ profile, onLogout }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <>
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden flex flex-col gap-1.5 p-2"
        title="メニュー"
      >
        <span className={`w-6 h-0.5 bg-white transition-all ${isOpen ? "rotate-45 translate-y-2" : ""}`} />
        <span className={`w-6 h-0.5 bg-white transition-all ${isOpen ? "opacity-0" : ""}`} />
        <span className={`w-6 h-0.5 bg-white transition-all ${isOpen ? "-rotate-45 -translate-y-2" : ""}`} />
      </button>

      {/* Drawer Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={handleClose}
          />

          {/* Menu Panel */}
          <div className="fixed right-0 top-0 bottom-0 bg-slate-900 text-white w-72 z-50 md:hidden shadow-2xl overflow-y-auto">
            {/* Menu Header */}
            <div className="border-b border-slate-700 px-4 py-4">
              <div className="text-right">
                <button
                  onClick={handleClose}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ✕
                </button>
              </div>
              {profile && (
                <div className="mt-3 text-xs">
                  <p className="text-gray-300">{profile.organizationName}</p>
                  <p className="font-semibold text-white mt-1">{profile.name}</p>
                  <p className="text-gray-400 text-[11px] mt-0.5">{profile.category}</p>
                </div>
              )}
            </div>

            {/* Menu Items */}
            <nav className="space-y-1 px-2 py-4">
              {/* 出動記録 */}
              <Link
                href="/dispatch/active"
                className="block px-4 py-3 text-sm text-gray-300 hover:bg-red-600 hover:text-white rounded-lg transition-colors"
                onClick={handleClose}
              >
                🚨 現在出動中
              </Link>

              <Link
                href="/dispatch"
                className="block px-4 py-3 text-sm text-gray-300 hover:bg-slate-700 hover:text-white rounded-lg transition-colors"
                onClick={handleClose}
              >
                📋 記録一覧
              </Link>

              <Link
                href="/dispatch/new"
                className="block px-4 py-3 text-sm text-gray-300 hover:bg-slate-700 hover:text-white rounded-lg transition-colors"
                onClick={handleClose}
              >
                + 新規出動
              </Link>

              <Link
                href="/dispatch/import"
                className="block px-4 py-3 text-sm text-gray-300 hover:bg-slate-700 hover:text-white rounded-lg transition-colors"
                onClick={handleClose}
              >
                📄 報告書
              </Link>

              {/* 管理者メニュー */}
              {profile?.accessLevel === "admin" && (
                <>
                  <div className="border-t border-slate-700 my-2" />
                  <div className="px-4 py-2 text-xs text-gray-500 font-semibold">
                    管理者
                  </div>
                  <Link
                    href="/admin/users"
                    className="block px-4 py-3 text-sm text-gray-300 hover:bg-slate-700 hover:text-white rounded-lg transition-colors"
                    onClick={handleClose}
                  >
                    👤 ユーザー管理
                  </Link>
                  <Link
                    href="/admin/activity"
                    className="block px-4 py-3 text-sm text-gray-300 hover:bg-slate-700 hover:text-white rounded-lg transition-colors"
                    onClick={handleClose}
                  >
                    📊 クルー別集計
                  </Link>
                  <Link
                    href="/admin/backup"
                    className="block px-4 py-3 text-sm text-gray-300 hover:bg-slate-700 hover:text-white rounded-lg transition-colors"
                    onClick={handleClose}
                  >
                    💾 バックアップ
                  </Link>
                </>
              )}

              {/* ログアウト */}
              <div className="border-t border-slate-700 my-2" />
              <button
                onClick={() => {
                  handleClose();
                  onLogout();
                }}
                className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-slate-700 hover:text-white rounded-lg transition-colors"
              >
                🚪 ログアウト
              </button>
            </nav>
          </div>
        </>
      )}
    </>
  );
}
