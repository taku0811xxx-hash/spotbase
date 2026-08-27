# SpotBase 機能サマリー（地図・現場一覧・AI提案まわり）

最終更新: 2026-08-22

本ドキュメントは、直近のセッションで実装・修正した以下3領域の機能について、
概要・主要な実装・工夫した点をまとめたものです。今後の開発・引き継ぎ時の
リファレンスとして参照してください。

対象ファイルの全体像は [AGENTS.md](../AGENTS.md) も参照してください。

---

## 1. 地図・ピン連動および表示制御

### 1-1. 詳細パネル開閉時のリサイズ追従・自動センタリング

**関連ファイル**: `components/Map.tsx`（`PanelResizeHandler` / `FlyToSelectedPin` / `MapInitializer`）

現場詳細パネル（`PinSidePanel`）の開閉によって地図の描画領域（コンテナ幅）が変化するが、
Leaflet はコンテナサイズの変化を自動検知しないため、そのままでは地図の一部が
グレーアウトしたり、中心がずれたりする問題があった。

- `MapInitializer`: マウント直後に `map.invalidateSize()` を実行し、SSR/初期描画時の
  タイル描画遅延を防止。
- `PanelResizeHandler`: `showDetailPanel` / `selectedPin` の変化を監視し、
  1. 即座に `map.invalidateSize()` を実行（コンテナサイズ変化への追従）
  2. パネルのCSSトランジション（開閉アニメーション）完了を待つため `setTimeout(200ms)` 後に
     再度 `map.invalidateSize()` を実行し、選択中ピンがあれば `map.setView()` で再センタリング
- `FlyToSelectedPin`: ピン選択時に地図を該当ピン位置へ移動する専用コンポーネント。
- 全ての地図移動処理（`setView` / 座標渲染）の前に `isValidCoordinate(lat, lng)` で
  NaN・Infinity・範囲外座標をチェックし、Leaflet の `Invalid LatLng object: (NaN, NaN)`
  エラーを未然に防止（`extractLatLng()` で複数の座標フォーマット（配列・オブジェクト・
  GeoJSON等）を正規化した上で検証）。

**工夫した点**:
- `flyTo` ではなく `setView` を採用（Leafletバージョン間の互換性問題を回避するため）。
- リサイズとセンタリングを2段階（即時 + 200ms遅延）に分けることで、CSSアニメーション中の
  中途半端なコンテナサイズでの計算ミスを防止。

### 1-2. 「現場ピンに戻る」リセンターボタン

**関連ファイル**: `components/PinSidePanel.tsx`（ヘッダー部）、`app/page.tsx`（`handleReturnToPin`）

- 現場詳細パネルのヘッダー1行目に「← 一覧に戻る」と並べて配置。
- クリックすると `handleReturnToPin()` が選択中ピンの座標へ `setFlyTo()` を発火し、
  ユーザーが地図をドラッグ・ズームして見失った場合でも即座に現場ピン位置へ復帰できる。
- 当初は地図オーバーレイ上のフローティングボタンとして実装していたが、
  地図イベントリスナーとの競合で表示が不安定だったため、詳細パネルのヘッダーへ移設し
  `onReturnToPin` コールバックとして直接呼び出す方式に変更。

### 1-3. 「駐車・駐停車可能」説明ボックス（凡例UI）の前面表示制御

**関連ファイル**: `components/Map.tsx`（`Map` コンポーネント JSX 直下、404行目付近）

- 地図右上（`absolute top-4 right-4`）に常時描画される、色分け説明ボックス。
- **原因調査で判明した不具合**: 当初 `z-[100]` を指定していたが、Leaflet の内部レイヤー
  （`leaflet-tile-pane: 200`、`leaflet-overlay-pane: 400`、`leaflet-marker-pane: 600`、
  `leaflet-popup-pane: 700`、ズームコントロール等 `leaflet-top/bottom: 1000`）の方が
  z-index が高く、かつ `.leaflet-container` は `position: relative` のみで独自の
  スタッキングコンテキストを作らないため、凡例ボックスが地図タイルの裏に完全に隠れていた。
- **修正**: `z-[2000]` に引き上げ、Leaflet内部の最大z-index（1000）を確実に上回るよう修正。
  加えてモバイル幅での `overflow-hidden` はみ出し対策として `max-w-[170px] sm:max-w-xs` の
  レスポンシブ対応も実施。
- 表示条件分岐は一切なく、地図が表示されている間は常時描画される。

---

## 2. 現場一覧の UI / インタラクション

**関連ファイル**: `components/GroupedPinList.tsx`、`app/page.tsx`（`handleSelectPin` / `handleOpenPinDetail`）

現場一覧アイテムのクリックで即座に詳細パネルが開いてしまうと、地図確認だけしたい
ユーザーにとって煩わしいため、**2段階フロー**を採用。

| 操作 | 挙動 |
|---|---|
| 1回目クリック（未選択アイテム） | 選択状態（Active、青ハイライト）にし、`map.setView()` でピン位置へ地図移動。詳細パネルは**開かない**。選択されたアイテムの現場名の横に「開く →」ボタンが動的に表示される |
| 「開く」ボタンをクリック | `handleOpenPinDetail()` が呼ばれ、現場詳細パネル（`PinSidePanel`）を確実に開く（常に開く方向のみで、トグルしない＝押し間違い防止） |
| 同一アイテムを再クリック（本文エリア） | 既存の `handleSelectPin()` のトグル挙動により詳細パネルの開閉を行う（互換動作として維持） |

**実装上のポイント**:
- 「開く」ボタンは選択中のアイテム（`selectedPinId === pin.id`）にのみ描画され、
  未選択アイテムには一切表示されない。
- HTML仕様上 `<button>` の入れ子はできないため、現場名エリアと「開く」ボタンは
  `<div>` 内の**兄弟要素**として配置し直した（旧実装は現場名エリア全体が1つの `<button>` で
  ラップされていたため、内部に別ボタンを追加できなかった）。
- 「開く」ボタンには `e.stopPropagation()` を付与し、親要素のクリックイベント（選択処理）との
  誤発火を防止。
- モバイル版は元々「ピン未選択の間だけ一覧を表示」する条件（`!selectedPin`）だったため、
  ピン選択と同時に一覧ごと非表示になり「開く」ボタンを表示する場がなかった。これを
  デスクトップと同じ条件（`!showDetailPanel`）に統一し、選択直後（詳細パネルが開くまで）は
  一覧を表示し続けるよう修正。
- `handleSelectPin()`（一覧・地図マーカー共通の選択処理）自体は変更せず、
  「開く」ボタン専用に `handleOpenPinDetail()` を新設することで、地図マーカークリック時の
  既存の2段階トグル挙動に影響を与えないようにした。

---

## 3. 駐車・駐停車エリア取得 ＆ AI撮影ポジション提案

### 3-1. Overpass API ミラーフォールバック・タイムアウト緩和・プログレッシブ表示

**関連ファイル**: `lib/roads.ts`（`findWideRoadsNear` / `findStoppableRoadsNear`）、`app/page.tsx`（`loadLocationInsights`）

道路検索は OpenStreetMap の Overpass API（無料・非公式運用）に依存しているため、
サーバー混雑やネットワーク不調時に安定して結果を得られないことがあった。

**ミラーサーバーフォールバック**:
```
OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",       // 本家
  "https://overpass.kumi.systems/api/interpreter",  // ミラー1
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter", // ミラー2
]
```
共通ヘルパー `fetchFromOverpassWithFallback()` が、上から順にミラーを試行し、
ネットワークエラー・HTTPエラー・タイムアウトのいずれでも即座に次のミラーへ切り替える。
全ミラー失敗時も例外を `throw` せず `null` を返し、呼び出し元は空配列 `[]` に
フォールバックすることで、UIにエラーを表示させずに静かに機能を縮退させる。

**タイムアウト設定**: 当初 `AbortController` による6秒タイムアウトが短すぎ、
Safari等で正常なリクエストまで「TypeError: Load failed」として打ち切られていたため、
Overpass APIの標準的な処理時間に余裕を持たせた **60秒** に緩和（`OVERPASS_TIMEOUT_MS`）。

**プログレッシブレンダリング（段階的表示）**:
- `findWideRoadsNear`（駐車候補）は「4車線以上」「一方通行2車線以上」の2ブロック、
  `findStoppableRoadsNear`（駐停車候補）は「幹線道路」「生活道路」の2ブロックに、
  それぞれ Overpass クエリを分割して**並行実行**。
- 各関数は `onBatch` コールバック引数を受け取り、いずれかのブロックの結果が届く
  たびに（`id` で重複排除した上で）ソート・件数制限した中間結果を通知する。
- `app/page.tsx` の `loadLocationInsights()` は `onBatch` で `setRoadSuggestions()` /
  `setStopSuggestions()` を逐次呼び出すため、Reactの再レンダリングにより
  **見つかった場所から順番に地図上へ線が描画されていく**（全ブロックの完了を待たない）。
- UI側（`PinSidePanel.tsx` / `SearchLocationPanel.tsx` の `RoadSuggestionsSection`）も
  「検索中でも取得済みの結果を隠さず表示」するよう変更し、
  「検索中...（見つかったスポット: X件）」という進捗表示でユーザーの誤解
  （「0件だった」との勘違い）を防止。

### 3-2. AI撮影ポジション提案（Anthropic API）

**関連ファイル**: `lib/shootingSuggestions.ts`、`app/api/suggest-shooting/route.ts`、`lib/osmContext.ts`、`lib/photos.ts`

現場の緯度経度・周辺OSMデータ・Wikipedia要約をもとに、Claude（Haiku）が
放送クルー向けの具体的な撮影ポジション（2〜4案）を提案する機能。

**モデル選定とフォールバック**（`app/api/suggest-shooting/route.ts`）:
- 環境変数 `ANTHROPIC_MODEL`（未設定時は `claude-3-5-haiku-latest`）を使用。
- `callAnthropicAPI()` ヘルパーが、指定モデルで404/400エラーが出た場合に
  自動的に `claude-3-haiku-20240307` へフォールバックして再試行。
- Vercelの10秒タイムアウト制約に対応するため、高速な Haikuモデル・`max_tokens: 800`程度に
  抑えた構成としている。

**堅牢なエラーハンドリング（多層防御）**:
1. **サーバー側**（`route.ts`）: 環境変数未設定、Anthropic APIのHTTPエラー
   （401/429/5xx等でメッセージを出し分け）、JSONパース失敗、レスポンス形式不正
   （配列でない等）をそれぞれ検知し、`errorType` 付きの詳細なエラーレスポンスと
   `console.error` ログを返す。
2. **クライアント側**（`lib/shootingSuggestions.ts`）: `fetch` 自体の失敗
   （Safari特有の `TypeError: Load failed` を含む）を個別に `try-catch` し、
   タイムアウトかどうかを判定した上で「通信エラーが発生しました。接続を確認して
   再度お試しください」というユーザーフレンドリーなメッセージに変換。
   サーバーからのエラーレスポンス（`errorType` / `details`）も詳しくログ出力。
3. **依存する外部API呼び出し**（`lib/osmContext.ts` の Overpass 呼び出し、
   `lib/photos.ts` の Wikipedia API 呼び出し）にも同様に `try-catch` を追加し、
   一部のデータ取得に失敗してもAI提案生成全体が失敗しないようにフェイルセーフ化
   （失敗時は空配列 / `null` を返し、可能な範囲の情報でプロンプトを組み立てる）。
4. **UIコンポーネント**（`ShootingSuggestionPanel.tsx` / `AiProposalSection.tsx` /
   `BroadcastLocationSuggester.tsx` など）: `TypeError` やメッセージ内容
   （`Load failed` / `Failed to fetch` / `NetworkError`）を判定し、
   白画面にならず常にトースト/インラインで分かりやすいエラーメッセージを表示。

**工夫した点**:
- サーバー・クライアントの両方に同様のエラー分類ロジックを持たせることで、
  「どちらで失敗しても最終的にユーザーには同じトーンの分かりやすいメッセージが出る」
  一貫性を確保。
- 外部無料API（Overpass・Wikipedia・Nominatim）はいずれも可用性の保証がないため、
  「失敗しても機能全体を落とさない」設計を徹底している。

---

## 主要ファイル一覧（早見表）

| 領域 | ファイル |
|---|---|
| 地図描画・リサイズ・凡例 | `components/Map.tsx` |
| 現場詳細パネル | `components/PinSidePanel.tsx` |
| 検索結果地点の詳細パネル | `components/SearchLocationPanel.tsx` |
| 現場一覧（グループ表示・選択・開くボタン） | `components/GroupedPinList.tsx` |
| トップページ（状態管理・各コンポーネント統合） | `app/page.tsx` |
| 道路検索（Overpassミラー・タイムアウト・分割クエリ） | `lib/roads.ts` |
| 中継候補地提案（Overpass + 過去実績） | `lib/suggestBroadcastLocations.ts` |
| 撮影ポジション提案（クライアント） | `lib/shootingSuggestions.ts` |
| 撮影ポジション提案（サーバー・Anthropic API） | `app/api/suggest-shooting/route.ts` |
| 放送位置スコアリング（サーバー・Anthropic API） | `app/api/suggest-locations/route.ts` |
| 周辺OSMデータ取得 | `lib/osmContext.ts` |
| 周辺写真・Wikipedia要約取得 | `lib/photos.ts` |

---

## 今後の検討候補

- Overpass API ミラーのCORS制限（`overpass.kumi.systems` 等、環境によっては
  ブラウザから直接呼べない場合がある）への対応。サーバーサイドプロキシ化も選択肢。
- プログレッシブ表示のブロック分割を、道路検索以外（駐車場提案 `suggestBroadcastLocations.ts` 等）にも
  横展開できないか検討。
- AI提案生成のエラーハンドリングパターン（サーバー・クライアント双方の多層防御）を
  共通ユーティリティ化し、新規API追加時の実装コストを下げる。
