# SpotBase - 変更履歴

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
