import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { APP_MODE, APP_MODE_META } from "@/lib/config";

// ブラウザタブのタイトル・検索エンジン向け説明文もAPP_MODEに応じて切り替える。
// title.defaultがこのレイアウト自体のタイトル、title.templateはサブページが
// `export const metadata = { title: "ページ名" }` を持つ場合に
// 「ページ名 | ここトレ！」のように展開されるテンプレート。
export const metadata: Metadata = {
  title: {
    default: APP_MODE_META[APP_MODE].title,
    template: APP_MODE_META[APP_MODE].titleTemplate,
  },
  description: APP_MODE_META[APP_MODE].description,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1.0,
  maximumScale: 1.0,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <head>
        {/* ロゴの書体(Fraunces)を読み込む。next/font/googleは使わず、ビルド時ではなく
            ブラウザ側でのみ読み込まれる<link>タグにしている(ビルド環境のネットワーク制限を避けるため) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@1,900&display=swap"
          rel="stylesheet"
        />
        {/* 「ここトレ！」(photoモード)向け: 柔らかい丸ゴシック体。
            他モードでは読み込むだけで未使用(CSSクラス側で出し分けるため害はない)。 */}
        <link
          href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`min-h-full flex flex-col ${APP_MODE === "photo" ? "font-rounded" : ""}`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
