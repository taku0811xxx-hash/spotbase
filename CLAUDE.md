@AGENTS.md

# アーキテクチャルール(マルチプロダクト構成)

## 1. プロジェクト基本構造
本リポジトリは `NEXT_PUBLIC_APP_MODE`(`pro` | `photo` | `walk`)で切り替わるマルチプロダクト構成である。
詳細な設計方針は [docs/MULTI_PRODUCT_ARCHITECTURE.md](docs/MULTI_PRODUCT_ARCHITECTURE.md) と [lib/config.ts](lib/config.ts) を参照。
現在の値は `getAppMode()` / `APP_MODE`([lib/config.ts](lib/config.ts))で取得し、未設定・不正値は `pro` にフォールバックする。

## 2. `photo` モード(ここトレ！ / B2C モバイル)
静的エクスポート(Static Export)+ Capacitor(iOS/Android)環境で動作する。

**絶対禁忌**:
- `/api/` への相対リクエストや API Routes の使用
- Server Actions の使用
- Node.js 固有ライブラリへの依存
- `gapi`(Google API Client)スクリプトの読み込み・使用

**データ構造**:
- `photo_users/{uid}`, `photo_spots` コレクションを使用(`users` コレクションは使用しない)
- Firebase Client SDK のみで完結させる

**開発上のガードルール**:
- pro 専用フックや外部通信を行うコンポーネントには、必ず `process.env.NEXT_PUBLIC_APP_MODE !== 'pro'` などの早期リターンガードを入れること
- 専用ビルドスクリプト [scripts/build-photo.mjs](scripts/build-photo.mjs) による静的ビルドおよび退避対象(`app/api`, `app/pin/...`, `app/dispatch/...` 等)を意識すること

## 3. `pro` モード(SpotBase / B2B Web)
放送・映像制作・現場管理向けの Web アプリ(API Routes / Server Actions フル活用)。

**データ構造**:
- `users` コレクションおよび `organizationId` によるテナント分離
- 特権処理やユーザー作成は Firebase Admin SDK を使用

## 4. 主要ビルドコマンド
- `npm run dev:pro` / `npm run dev:photo` / `npm run dev:walk` : モード別ローカル開発サーバー
- `npm run build` : SpotBase(pro)本体ビルド(`next build --webpack` 固定。理由は下記「既知の問題」参照)
- `npm run build:photo` : ここトレ！(photo)専用静的ビルド([scripts/build-photo.mjs](scripts/build-photo.mjs))
- `npm run cap:sync:photo` : iOS同期(Capacitor)
- `npm run cap:open:photo` : Xcode起動

コーディング時は、変更対象のモードに応じて上記コマンドで動作確認すること。pro側の変更は必ず `next build --webpack` で確認する(素の `next build` はTurbopackでfirebase-adminが動かない可能性があるため)。
