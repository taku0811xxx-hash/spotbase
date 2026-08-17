import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React Leaflet(地図ライブラリ)は開発モードのStrict Mode(コンポーネントを
  // 意図的に二重初期化して副作用のバグを検出する仕組み)と相性が悪く、
  // 地図が壊れて "this.getPane().appendChild" エラーが出ることがあるため無効化している。
  reactStrictMode: false,

  // firebase-admin(サーバー専用)を、Next.jsのバンドラーで処理せず
  // そのままNode.jsに読み込ませる設定。これをしないと、firebase-adminが
  // 内部で使っているESM専用パッケージ(jose)とバンドラーの相性問題で、
  // Vercel上で "ERR_REQUIRE_ESM" エラーが発生する。
  // firebase-admin本体だけでなく、その内部依存(認証まわり)も対象に含めている。
  serverExternalPackages: [
    "firebase-admin",
    "google-auth-library",
    "gaxios",
    "gcp-metadata",
    "jose",
    "jwks-rsa",
  ],
};

export default nextConfig;
