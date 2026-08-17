import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React Leaflet(地図ライブラリ)は開発モードのStrict Mode(コンポーネントを
  // 意図的に二重初期化して副作用のバグを検出する仕組み)と相性が悪く、
  // 地図が壊れて "this.getPane().appendChild" エラーが出ることがあるため無効化している。
  reactStrictMode: false,
};

export default nextConfig;
