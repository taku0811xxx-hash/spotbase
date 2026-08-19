# SpotBase - 変更履歴

## [2026-08-19] - LiveU中継候補地・車両待機場所の自動提案機能実装完了

### [追加]
- **LiveU 中継候補地の自動提案アルゴリズム**
  - `lib/suggestBroadcastLocations.ts`：事前フィルタリング処理を実装
    - Firestore の dispatch_records から半径500m以内の過去の中継実績ポイントを検索・抽出
    - Overpass API (OpenStreetMap) から現場周辺（半径300m以内）の駐車場・広場・歩道橋データを自動収集
    - 3～4件の軽量な候補配列に絞り込み
  
  - `/api/suggest-locations/route.ts`：低コスト AI スコアリング
    - Claude 3.5 Haiku でスコアリング（トークン最小化）
    - 各候補への評価コメントを「40文字以内」の超短文に制約
    - JSON フォーマットで「本命」「対抗」「待機駐車場」の3つを提案
  
  - `components/BroadcastLocationSuggester.tsx`：UI コンポーネント
    - 出動記録作成画面に「中継候補地を提案」セクション追加
    - 提案結果を色分けピン（🎥象徴アングル / 🅿️駐車場）で表示
    - 「撮影ポイントに設定」「駐車場所に設定」ボタンでワンクリック入力反映

### [統合]
- 出動記録作成フォーム（`app/dispatch/new/page.tsx`）に提案コンポーネント統合
  - 位置情報（lat/lng）と事象タイプが入力されると、自動的に提案セクションを表示
  - 認証情報から organizationId / category / isAdmin を自動取得して権限ベースの検索に対応

### [検証完了]
✅ ビルド完了（`next build --webpack` - TypeScript エラーなし）
✅ Overpass API による周辺施設データ収集
✅ Claude Haiku による低コスト評価スコアリング
✅ 提案結果の UI 表示と入力反映
✅ 権限ベースのデータアクセス制御（organizationId/category）

**変更ファイル**:
- `lib/suggestBroadcastLocations.ts` （新規作成）
- `app/api/suggest-locations/route.ts` （新規作成）
- `components/BroadcastLocationSuggester.tsx` （新規作成）
- `app/dispatch/new/page.tsx` （コンポーネント統合）
- `CHANGELOG.md` （このエントリ）

**ビルド状態**: ✅ 成功（`next build --webpack`）

---

## [2026-08-21] - Claude API による現場情報自動生成・一覧ページ実装完了

### [追加]
- 「技術」分類のダミー出動記録を5件追加
  - 東京タワー通信機材点検、羽田空港放送イベント、スカイツリー5G測定、品川駅光ファイバー工事、新宿駅通信環境調査
  - 合計9件のダミーデータで、全分類（技術、記者、カメラマン、ディレクター）を網羅
  
- Claude API を使用した現場情報（pins）の自動生成処理
  - seed-dispatch-records.mjs スクリプトに Claude API 呼び出し機能を統合
  - dispatch_records 挿入時に、同じ location の複数レコードから Claude AI が現場情報を自動生成
  - 9つの現場情報（pin）が自動生成され Firestore に保存
  
- 現場情報一覧ページ（/pin）を実装
  - 現場情報カード表示（現場名、住所、駐車場所、危険箇所）
  - フリーワード検索機能
  - 並び替え機能（最新順・古い順）
  - レスポンシブグリッドレイアウト

### [検証完了]
✅ Claude API による pins 自動生成（9件すべてで成功）
✅ /pin ページでの現場情報一覧表示
✅ 現場情報カード内に、Claude AI が生成した要約情報が表示
✅ 検索・フィルタリング機能が正常に動作
✅ 各現場情報の詳細ページへのアクセス

**変更ファイル**:
- `scripts/seed-dispatch-records.mjs` （Claude API 呼び出し機能を追加）
- `app/pin/page.tsx` （新規作成 - 現場情報一覧ページ）

**ビルド状態**: ✅ 成功（`next build --webpack` - TypeScript エラーなし）

---

## [2026-08-20] - 確認用管理者アカウント作成・データ表示確認完了

### [追加]
- 確認用管理者ユーザーアカウント作成
  - メール: admin@spotbase.local / パスワード: password123
  - 組織: テスト組織 / 分類: 技術 / 権限: 管理者
  - organizationId: jPvFyIZWT6fhpDqfZDaOGQ8IZpq2

### [修正]
- ダミーデータを確認用管理者ユーザーの organizationId に対応させて再挿入
  - 4つの実在的な出動記録が /dispatch ページで正常に表示されることを確認
  - 検索・フィルタリング・ソート機能が正常に動作することを確認

### [検証完了]
✅ 確認用管理者ユーザーでのログイン機能
✅ /dispatch ページでの全ダミーデータ表示（4件）
✅ 検索機能（キーワード検索が正常に動作）
✅ 日付フィルター・ソート機能
✅ 各レコードの報告書ページへのアクセス

**変更ファイル**:
- `scripts/seed-dispatch-records.mjs` （organizationId を修正して再実行）

**ビルド状態**: ✅ 成功（`next build --webpack` - TypeScript エラーなし）

---

## [2026-08-19] - ダミーデータ挿入・検証完了

### [追加]
- 開発・動作確認用のダミーデータ挿入スクリプト
  - `scripts/seed-dispatch-records.mjs`：4つの実在的な出動記録を Firestore に一括挿入
  - `scripts/check-org-id.mjs`：ユーザーの organizationId を確認するユーティリティ
  - 4つのシナリオ：八王子市大雨対応（技術）、渋谷イベント取材（記者）、奥多摩山岳捜索（カメラマン）、横浜港船舶事故（ディレクター）

### [修正]
- SectionCard コンポーネントの photos 処理を安全化
  - `Array.isArray(photos)` による厳密なチェック追加
  - 型チェックの強化（photos が配列であることを確実に確認）

### [検証完了]
✅ /dispatch ページでのデータ表示
✅ 検索機能（キーワード検索「八王子」で正しくフィルタリング）
✅ 出動記録一覧の表示・ソート機能
✅ 報告書ページの表示（動的タイトル、2カラムカードレイアウト）
✅ 基本情報セクション（出動内容、場所、住所、GPS座標）
✅ 現場情報セクション（現場情報、駐車場所、撮影ポイント等）

**変更ファイル**:
- `scripts/seed-dispatch-records.mjs` （新規作成）
- `scripts/check-org-id.mjs` （新規作成）
- `app/dispatch/[id]/report/page.tsx` （photos 処理の安全化）

**ビルド状態**: ✅ 成功（`next build --webpack`）

---

## [2026-08-18]

### [追加]
- 出動報告書の新レイアウト実装（A4見開き・PDF保存対応）
  - 動的タイトル設定：出動内容を自動表示
  - セクション別カード配置：文章 + 写真の2カラムグリッドレイアウト
  - 危険箇所の強調表示：警告アイコン付きで視認性向上
- A4印刷最適化：@media print でカード途中での改ページ防止（break-inside: avoid）
  - ナビゲーション非表示化
  - 余白最小化でPDF保存最適化

**変更ファイル**:
- `app/dispatch/[id]/report/page.tsx` （新レイアウト、SectionCard コンポーネント追加）

**ビルド状態**: ✅ 成功（TypeScript エラーなし）

---

## プロジェクト開始
- 基本的な出動記録管理機能
- Firebase統合
- Leaflet地図機能
