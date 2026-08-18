<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SpotBase プロジェクト概要

放送・報道クルー向けの現場ロケハン情報管理SaaS。
リポジトリ: github.com/taku0811xxx-hash/spotbase(Vercelにデプロイ済み)

## 技術スタック
- Next.js 16(App Router)
- Firebase(Firestore / Storage / Authentication)
- Leaflet地図
- Anthropic API(Claude Haiku使用、コスト抑制のため)

## 実装済み機能

### 認証・組織管理
- Firebase Authentication(メールアドレス+パスワード)。**招待コード方式は廃止済み**
  (README.mdには招待コード認証の記述が残っているが古い情報なので注意)
- 組織(例: NHK)ごとにユーザーを管理。ユーザーは「分類」(記者・カメラマンなど)を持つ
- 権限は2段階: 管理者(同組織なら分類問わず閲覧可)/一般ユーザー(同組織・同分類のみ閲覧可)
- 他組織のデータは誰であっても一切見えない
- 管理者専用画面(/admin/users)から新規メンバーを発行(サーバー側のFirebase Admin SDK経由)
- 最初の組織・管理者は scripts/bootstrap-admin.mjs で一度だけセットアップ
- lib/AuthProvider.tsx(useAuthフック)で認証状態・プロフィールを管理

### 現場情報(pins)
- 地図上にピン登録。駐車場所・撮影ポイント・伝送状況(IP/FPU)・危険箇所などを記録
- 周辺の駐車できそうな道路をOverpass APIから提案(駐車/駐停車で条件を分けて表示)
- AIによる撮影ポジション提案機能(Claude Haiku使用)

### 出動記録(dispatch_records)
- 出動者名・場所名・住所・GPS位置・出動内容・現場情報・記録メモ(複数可)・
  機材表(CSV)・現場写真(キャプション付き)・GPSチェックポイント・リアルタイム軌跡を記録
- 誰でも編集可能、ただし編集履歴(誰が・いつ・何を変えたか)を自動記録
- 報告書ページ(印刷/PDF保存対応、写真をドラッグで自由配置できるレイアウトエディタ付き)
- 出動記録保存時、同じ場所付近の過去記録をAIが自動統合して現場記録(pin)を自動生成・更新
  (lib/pinSync.ts。半径300m以内を「同じ場所」とみなす)

### SNS参考情報(実験的機能)
- Bluesky(無料SNS)の公開検索APIで「火事」「事故」等のキーワード投稿を収集
- Claude(Haiku)でノイズ・デマらしきものを除外し、参考情報として集約
- GitHub Actions(15分おき)で定期実行し、結果をFirestoreに保存、トップページに
  「未確認・参考情報」として控えめに表示
- 検討の結果、X(旧Twitter)API・掲示板監視は不採用(コスト・法的リスクのため)
- 今後の検討候補: 国交省xROAD/JARTICのオープンデータ(信頼性高い)、
  社内カメラマン向けLINE Botでの現場タレコミ

## 技術的な既知の問題・対応履歴
- package.jsonのbuildコマンドは `next build --webpack`(Turbopackのバグでfirebase-admin
  が正常に動かないため、webpackに固定)
- package.jsonに `"overrides": { "jose": "4.15.9" }` を指定(firebase-adminの依存先
  jwks-rsaがESM専用の新しいjoseを引っ張ってきてしまい、Node.jsでrequireできない問題への対処)
- Vercelでの自動デプロイ(GitHub連携)が原因不明で止まることがあった。その際は
  Vercelプロジェクトの「Settings > Git」で一度Disconnect→Connectし直すか、
  `npx vercel --prod` で手動デプロイして凌いだ

## 必要な環境変数(.env.local)
- NEXT_PUBLIC_FIREBASE_*(6項目、Firebaseコンソールから取得)
- FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY(サービスアカウント用)
- ANTHROPIC_API_KEY(console.anthropic.comで発行、Claude Haiku使用でコスト抑制済み)
- CRON_SECRET(SNS監視用エンドポイントの認証、GitHub Secretsにも同じ値を登録)

## Firestore/Storageルール
- pins, dispatch_records: 組織・分類ベースでアクセス制御
- users: 書き込みは一切不可(Admin SDK経由のみ)、読み取りは同組織なら可
- sns_signals: ログインしていれば誰でも閲覧可、書き込みはサーバー側のみ
- storage.rules: pins/, dispatch_records/ 配下は読み書き可

## 次にやりたいこと(未着手)
- 国交省xROAD/JARTICオープンデータとの連携検討
- 社内向けLINE Bot現場タレコミ機能の検討

## コーディング時の注意
- ビルド確認は `next build --webpack` を使うこと(素の `next build` はTurbopackで
  firebase-adminが動かない可能性がある)
- jose のバージョンを不用意に上げない(overridesで4.15.9に固定中)

