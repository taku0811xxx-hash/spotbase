import type { NextConfig } from "next";

// 「ここトレ！」(NEXT_PUBLIC_APP_MODE=photo) の Capacitor/iOS 向け専用設定。
// SpotBase本体が使う next.config.ts はそのまま(Vercel向けサーバービルド)にしておき、
// このファイルは scripts/build-photo.mjs が一時的に next.config.ts に差し替えて使う。
//
// output: 'export' は Cookies / Request に依存する Route Handler や
// generateStaticParams のない動的ルートと共存できない
// (node_modules/next/dist/docs/01-app/02-guides/static-exports.md 参照)。
// そのため scripts/build-photo.mjs 側で app/api・app/pin/[pinId]・app/dispatch/[id]
// をビルド対象から一時退避してからこの設定でビルドする。
const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  reactStrictMode: false,
  typescript: {
    // app/api・app/pin/[pinId]・app/dispatch/[id] を一時退避するため、
    // それらの型を参照しているSpotBase本体側のファイル(例: BroadcastLocationSuggester.tsx)で
    // 型エラーが出る。型の健全性自体は `tsc --noEmit`(退避前の全体コード)で別途確認するため、
    // このモバイル向けビルドでは next build 内蔵の型チェックをスキップする。
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
