# SpotBase (MVP)

報道現場のロケハン情報（駐車場所・撮影ポイント・電波状況・危険箇所）を
地図上に蓄積・共有するための最小構成アプリ。

## セットアップ

1. 依存パッケージをインストール
   ```
   npm install
   ```

2. Firebaseプロジェクトを作成し、Firestore と Storage を有効化する
   （Firebaseコンソール → プロジェクトを追加 → Firestore Database / Storage を有効化）

3. `.env.local.example` を `.env.local` にコピーして、Firebaseの設定値と
   招待コード（`NEXT_PUBLIC_INVITE_CODE`）を入力する
   ```
   cp .env.local.example .env.local
   ```

4. 開発サーバーを起動
   ```
   npm run dev
   ```

5. Firestoreのセキュリティルールを `firestore.rules` の内容で更新する
   （Firebaseコンソール → Firestore Database → ルール、から貼り付け）
   ※現状は招待コード認証がクライアント側のみのため、read/writeを全開放している。
     試験導入する部署の人数が少ないうちは実用上のリスクは低いが、
     本格運用する場合はFirebase Authへの移行を検討すること。

## 実装済み機能 (MVP)

- 地図表示・ピン配置（Leaflet + OpenStreetMap）
- ピン登録：現場名・住所・駐車場所・撮影ポイント・電波状況・危険箇所・写真
- ピン詳細閲覧
- 現場名・住所によるキーワード検索
- 招待コードによる簡易ログイン

## 未実装（今後の拡張候補）

- AIによる未知の場所への候補提案（過去データが十分溜まってから着手）
- Firebase Authによる本格的なユーザー・権限管理
- SNS投稿分析による周辺状況の自動表示
- Google Maps APIへの切り替え（住所検索の精度向上など）
