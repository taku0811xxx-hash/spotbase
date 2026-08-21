"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { UserProfile } from "@/lib/userProfile";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile | null;
  onLogout: () => void;
}

/**
 * MobileMenuPortal
 * ハンバーガーメニューを React Portal で document.body 直下にレンダリング
 * 親要素のスタッキングコンテキスト（transform, filter, overflow等）の影響を完全に遮断
 *
 * 【スタッキングコンテキスト解放】
 * - document.body 直下に配置 → ヘッダーの relative/z-index の制約から解放
 * - z-[99999] で全要素の上に表示
 *
 * 【ハイドレーション対応】
 * - useEffect で mounted フラグを設定 → SSR/クライアント差分を回避
 * - mounted false 時は null を返す → hydration mismatch を防止
 */
export default function MobileMenuPortal({ isOpen, onClose, profile, onLogout }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ハイドレーション完了まで何も表示しない
  if (!mounted) {
    return null;
  }

  // document.body が存在することを確認
  if (typeof window === "undefined" || !document.body) {
    return null;
  }

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <>
      {/* Backdrop - z-[99998] */}
      <div
        className="fixed inset-0 bg-black/80 z-[99998] md:hidden pointer-events-auto"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Menu Panel - z-[99999] (最前面) - 右側配置 */}
      <div
        className="fixed inset-y-0 right-0 w-72 bg-slate-900 text-white z-[99999] md:hidden shadow-2xl overflow-y-auto pointer-events-auto"
        role="navigation"
        aria-label="メニュー"
        style={{ maxHeight: "100vh", overflowY: "auto" }}
      >
        {/* Menu Header */}
        <div className="border-b border-slate-700 px-4 py-4">
          <div className="text-right">
            <button
              onClick={onClose}
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
            onClick={onClose}
          >
            🚨 現在出動中
          </Link>

          <Link
            href="/dispatch"
            className="block px-4 py-3 text-sm text-gray-300 hover:bg-slate-700 hover:text-white rounded-lg transition-colors"
            onClick={onClose}
          >
            📋 記録一覧
          </Link>

          <Link
            href="/dispatch/new"
            className="block px-4 py-3 text-sm text-gray-300 hover:bg-slate-700 hover:text-white rounded-lg transition-colors"
            onClick={onClose}
          >
            + 新規出動
          </Link>

          <Link
            href="/dispatch/import"
            className="block px-4 py-3 text-sm text-gray-300 hover:bg-slate-700 hover:text-white rounded-lg transition-colors"
            onClick={onClose}
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
                onClick={onClose}
              >
                👤 ユーザー管理
              </Link>
              <Link
                href="/admin/activity"
                className="block px-4 py-3 text-sm text-gray-300 hover:bg-slate-700 hover:text-white rounded-lg transition-colors"
                onClick={onClose}
              >
                📊 クルー別集計
              </Link>
              <Link
                href="/admin/backup"
                className="block px-4 py-3 text-sm text-gray-300 hover:bg-slate-700 hover:text-white rounded-lg transition-colors"
                onClick={onClose}
              >
                💾 バックアップ
              </Link>
            </>
          )}

          {/* ログアウト */}
          <div className="border-t border-slate-700 my-2" />
          <button
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-slate-700 hover:text-white rounded-lg transition-colors"
          >
            🚪 ログアウト
          </button>
        </nav>
      </div>
    </>,
    document.body
  );
}
