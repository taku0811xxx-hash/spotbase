"use client";

import { memo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import UserStatusPanel from "./UserStatusPanel";
import type { UserProfile } from "@/lib/userProfile";
import { APP_MODE, APP_MODE_META } from "@/lib/config";
import { usePhotoProfile } from "@/lib/hooks/usePhotoProfile";

interface Props {
  profile: UserProfile | null;
  onLogout: () => void;
  onToggleMenu?: () => void;
  gpsTracking?: boolean; // GPS追跡ON/OFF
  gpsAcquiring?: boolean; // GPS測位中フラグ(ボタンをローディング表示・disabledにする)
  onToggleGpsTracking?: () => void;
  onNewSiteRecord?: () => void; // 「＋現場記録」(SuperScout風の新規現場記録モーダル)を開く
  onNewPhotoSpot?: () => void; // 「ここトレ！」(photoモード)専用: スポット投稿モーダルを開く
}

// ヘッダーUI(PC/モバイル共通)。
// 左: ハンバーガーメニュー(既存メニュー項目はすべてここに格納) + ロゴ + 「＋現場記録」(左詰め)
// 右: ユーザーステータスパネル(ユーザー情報 / GPS ON-OFF / ログアウト)
// 報道専用の緊急出動・対応件数バッジ(旧「出動中」リンク/「N件対応中」)は
// ロケハン全般向けアプリへのコンセプト変更に伴い廃止した。
//
// 注意(z-index): このヘッダーは Leaflet地図(コントロール z-index:1000、Map.tsx内の
// 独自オーバーレイは最大 z-[2000])と兄弟要素として並ぶため、ヘッダー自身の
// z-indexが低いと「中の要素(ユーザーステータスのドロップダウン等)にどれだけ
// 高いz-indexを与えても地図の裏に隠れる」問題が起きる。これは、position+z-index
// を持つ要素がその時点で新しいスタッキングコンテキストを作り、子要素の
// z-indexが「そのコンテキスト内でのみ」意味を持つため(=子のz-9999は親のz-50を
// 追い越せない)。そのため、ヘッダー全体の外側コンテナ自体を地図より
// 十分高いz-[9999]にしておく必要がある。
const HeaderNav = memo(function HeaderNav({
  profile,
  onLogout,
  onToggleMenu,
  gpsTracking = false,
  gpsAcquiring = false,
  onToggleGpsTracking,
  onNewSiteRecord,
  onNewPhotoSpot,
}: Props) {
  const pathname = usePathname();
  // photoモード専用のアイコン画像上書き(プロフィール編集で設定)。
  // 他モードでは未使用だが、hooksはコンポーネントの全レンダーで無条件に呼ぶ必要があるため
  // ここで呼んでおき、表示側でAPP_MODE === "photo"の場合のみ使う。
  const { avatarDataUrl } = usePhotoProfile(profile?.name ?? "ゲスト");
  return (
    <div className="relative z-[9999] w-full max-w-full box-border flex flex-row items-center justify-between px-3 py-1.5 bg-gray-900 text-white overflow-visible gap-1">
      {/* 左: ハンバーガーメニュー + ロゴ + 新規出動(すべて左詰め) */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink min-w-0 overflow-x-auto">
        <button
          onClick={onToggleMenu}
          className="relative flex flex-col gap-1 p-1 -ml-1 flex-shrink-0"
          title="メニュー"
          aria-label="メニューを開く"
        >
          <span className="w-5 h-0.5 bg-white transition-all duration-300" />
          <span className="w-5 h-0.5 bg-white transition-all duration-300" />
          <span className="w-5 h-0.5 bg-white transition-all duration-300" />
        </button>
        <Link href="/" className="flex-shrink-0">
          <Logo className="text-white text-xs" title={APP_MODE_META[APP_MODE].title} />
        </Link>

        {onNewSiteRecord && (
          <button
            onClick={onNewSiteRecord}
            className="text-white text-[9px] sm:text-xs font-semibold rounded-lg px-1.5 sm:px-2.5 py-0.5 sm:py-1.5 bg-indigo-700 shadow-sm hover:bg-indigo-800 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150 whitespace-nowrap flex-shrink-0"
          >
            ＋ 現場記録
          </button>
        )}

        {/* 「ここトレ！」(photoモード)専用: ギャラリー⇔地図一覧のページ切り替えタブ */}
        {APP_MODE === "photo" && (
          <nav className="flex items-center gap-1 flex-shrink-0 ml-1">
            <Link
              href="/"
              className={`text-[10px] sm:text-xs font-semibold rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 transition-colors whitespace-nowrap ${
                pathname === "/" ? "bg-white text-gray-900" : "text-white/80 hover:bg-white/10"
              }`}
            >
              ギャラリー
            </Link>
            <Link
              href="/map"
              className={`text-[10px] sm:text-xs font-semibold rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 transition-colors whitespace-nowrap ${
                pathname === "/map" ? "bg-white text-gray-900" : "text-white/80 hover:bg-white/10"
              }`}
            >
              地図から探す
            </Link>
          </nav>
        )}
      </div>

      {/* 右: (photoモードのみ)投稿ボタン + ユーザーステータスパネル */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {onNewPhotoSpot && (
          <button
            onClick={onNewPhotoSpot}
            className="text-white text-[10px] sm:text-xs font-bold rounded-full px-3 sm:px-4 py-1.5 bg-gradient-to-r from-orange-500 to-pink-500 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150 whitespace-nowrap"
          >
            ＋ 写真を投稿
          </button>
        )}
        {/* 「ここトレ！」(photoモード)専用: マイページへのリンク(テキストで明示) */}
        {APP_MODE === "photo" && (
          <Link
            href="/mypage"
            className={`flex items-center gap-1 rounded-full text-[10px] sm:text-xs font-semibold px-2.5 sm:px-3 py-1 sm:py-1.5 transition-colors flex-shrink-0 whitespace-nowrap ${
              pathname === "/mypage" ? "bg-white text-gray-900" : "bg-white/10 text-white hover:bg-white/20"
            }`}
            title="マイページ"
            aria-label="マイページ"
          >
            {avatarDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarDataUrl} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
            ) : (
              <span>👤</span>
            )}
            <span>マイページ</span>
          </Link>
        )}
        <UserStatusPanel
          profile={profile}
          gpsTracking={gpsTracking}
          gpsAcquiring={gpsAcquiring}
          onToggleGpsTracking={onToggleGpsTracking}
        />
      </div>
    </div>
  );
});

export default HeaderNav;
