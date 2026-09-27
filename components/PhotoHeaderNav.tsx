"use client";

// 「ここトレ！」(photoモード)専用のスマホ向けヘッダー。
// pro向けの共有HeaderNav(ハンバーガーメニュー・ユーザー詳細パネル付き)とは別に、
// photoモードでは画面横断の青ベース背景の中にアプリタイトルのみを中央配置する
// シンプルな構成にする。
// 「＋ 写真を投稿」「マイページ」ボタンおよびギャラリー⇔地図タブは、
// Instagram風の下部固定ナビゲーション(PhotoBottomNav)に移動した。
// ハンバーガーメニュー・ユーザー詳細情報(メールアドレス等)は表示しない
// (ログアウトはマイページのプロフィールカードから行う)。
export default function PhotoHeaderNav() {
  return (
    <div className="w-full max-w-full box-border px-3 pt-3 pb-3 bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center">
      <h1 className="font-rounded text-xl font-extrabold tracking-wide text-white drop-shadow-sm">
        ここトレ！
      </h1>
    </div>
  );
}
