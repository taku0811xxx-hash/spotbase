# マルチプロダクト対応 調査・提案メモ

将来的に「散歩・Vlogアプリ」「フォトスポット共有アプリ」など、SpotBaseと同じ
地図・ピン構造を使う別プロダクトを同一コードベースから展開できるかの調査結果と、
実現するための設計方針の提案。**現時点ではコードへの適用(Map.tsxの分割など)は
行っておらず、方針のみをまとめたドキュメント。**

## 1. `lib/pins.ts`(Pin型)の拡張性

### 現状評価
`Pin`型はすでに大半のフィールドがオプショナル(`?`)になっており、機能追加のたびに
新しいオプショナルフィールドを積み増す形で進化してきた(`drawings`、`aiProposal`等)。
そのため、新しいプロダクト固有の情報を追加すること自体は問題なく行える構造になっている。

### 今回の変更
`PinExif`型(`camera` / `lens` / `fNumber` / `iso` / `exposureTime` / `shotAt`)を追加し、
`Pin.exif?: PinExif` として持たせた([lib/pins.ts](../lib/pins.ts))。
SpotBase本体では常に`undefined`のままで、既存動作への影響はない。

散歩ログ(移動軌跡)については、`lib/userPathHistory.ts`の`PathPoint[]`が
すでに汎用的な緯度経度+タイムスタンプの配列として実装済みで、Pin自体に
持たせる必要はなく既存の仕組みを流用できる。

### 今後の懸念点
- `Pin`型は現状「SpotBase(放送クルー向け)」のフィールドと「将来の派生プロダクト」の
  フィールドが同じ型の中に同居していく設計になっている。フィールドが増え続けると、
  「このプロダクトではどのフィールドを使うのか」が型定義だけでは分からなくなる。
  → 派生プロダクトが実際に動き出すタイミングで、`Pin`をプロダクト非依存の
    「コア(id/lat/lng/name/address/photoUrls等)」と、プロダクトごとの
    「拡張部分(`spotbase?: SpotBaseFields`, `walk?: WalkFields`, `photo?: PhotoFields`)」
    に分割することを検討したい(いきなり分割はせず、フィールドが増えて
    実際に困ってから着手で十分)。

## 2. 地図コンポーネント(`components/Map.tsx`)の結合度

### 現状評価
`Map.tsx`は約2,300行の単一コンポーネントで、以下がすべて直接組み込まれている。

- SpotBase固有UI: `FieldNoteForm`(現場一次情報の投稿フォーム)を直接import・描画
- 報道クルー位置表示: `CrewMember` / `CrewStatus`(ダミーデータ)によるクルーピンの色分け・ポップアップ
- 出動関連: 自分の現在地マーカー、移動経路(`PathPoint[]`)、出動中クルーとの連携
- 気象レイヤー: 雨雲レーダー・警報ポリゴン等(`WeatherLayers.tsx`は分離済みでimportのみ)
- 道路提案(`RoadSuggestion`)、速報事案(`Incident`/`BreakingAlert`)などSpotBase固有の情報レイヤー

`Props`型(`components/Map.tsx:414`)を見ると、`pins`のような汎用的なものと、
`crewMembers`・`fieldNotes`・`onCreateFieldNote`・`myStatus`のようなSpotBase固有のものが
同じフラットな1つのPropsオブジェクトに混在している。

→ **結論: 密結合している。** 地図描画・ピン配置というコア機能と、SpotBase固有の
業務ロジック(クルー管理・現場一次情報投稿・出動連携)が同一コンポーネント内で
混ざっており、そのままでは「地図とピンだけ」を別プロダクトに持ち出せない。

### 分離の方向性(提案、未着手)
1. **コアの地図コンポーネント**を切り出す: `MapContainer`初期化、ピンの描画・クリック、
   検索結果マーカー、現在地表示など「プロダクトを問わず使う」部分のみを持つ
   `CoreMap`(仮)コンポーネントにする。Propsは`pins` / `onSelectPin` / `center` など
   最小限に絞る。
2. **SpotBase固有の要素はレイヤーとして外側から合成する**: クルー位置・現場一次情報・
   道路提案・気象レイヤーなどは、`CoreMap`に「追加レイヤーをchildrenやslotとして
   差し込める」余地を持たせ、SpotBase側の呼び出し元(`app/page.tsx`)が
   `<CoreMap><CrewLayer /><FieldNoteLayer />...</CoreMap>`のように組み立てる形にする。
   react-leafletの`Marker`/`Popup`は子コンポーネントとして自然に合成できるため、
   この形は技術的に無理がない。
3. 一気に分割するのではなく、まずは新規レイヤー(クルー・現場一次情報など)を
   追加するたびに「Map.tsx本体に直接足す」のではなく「別ファイルの子コンポーネントとして
   作り、Map.tsxはchildrenとして受け取るだけ」というルールを今後の実装から徹底する形が
   現実的(いきなりの大規模リファクタは規模・リスクが大きいため)。

## 3. マルチモード構成(`APP_MODE`)の設計方針(提案)

### 方針
Next.jsのビルド時環境変数(`NEXT_PUBLIC_APP_MODE`)で表示モードを切り替える、
シンプルなフラグ方式を提案する。ランタイムでの動的切り替えは不要
(プロダクトごとに別のVercelプロジェクト/環境変数でデプロイする前提)なため、
`.env`で固定するビルド時定数で十分。

```ts
// lib/appMode.ts (新規, 未実装のイメージ)
export type AppMode = "spotbase" | "walk" | "photo";

export const APP_MODE: AppMode =
  (process.env.NEXT_PUBLIC_APP_MODE as AppMode) ?? "spotbase";

export const APP_MODE_META: Record<AppMode, { title: string; description: string }> = {
  spotbase: { title: "SpotBase", description: "放送・報道クルー向け現場ロケハン情報管理" },
  walk: { title: "(仮)散歩ログ", description: "散歩・Vlogの記録・共有" },
  photo: { title: "(仮)フォトスポット", description: "撮影スポットの共有" },
};
```

### 使い方のイメージ
- `APP_MODE === "spotbase"`の場合のみ、`CoreMap`に`CrewLayer`や`FieldNoteLayer`を
  合成する(2で提案したレイヤー構成と組み合わせる)。
- ヘッダーのロゴ・タイトル・メニュー項目も`APP_MODE_META`から出し分ける。
- Firestoreのコレクション名(`pins`, `field_notes`等)は現状プロダクト間で
  共有しない想定なら、モードごとに別Firebaseプロジェクトを用意し、
  `.env.local`の`NEXT_PUBLIC_FIREBASE_*`をプロダクトごとに切り替える
  (=Vercelプロジェクト自体を分ける)方が、データ分離の観点でも安全。
- `Pin`型のプロダクト固有フィールド(1章参照)も、将来的には
  `APP_MODE`ごとにどのフィールドを使うかをコード上のコメントで明示すると
  型だけでは見えない「このモードではこのフィールドを使う」という対応関係が
  追いやすくなる。

### 注意点
- 今回はドキュメント・方針の提案のみで、`APP_MODE`自体はまだコードに実装していない。
  実際に2つ目のプロダクトに着手するタイミングで、上記の`lib/appMode.ts`と
  `CoreMap`分離を合わせて着手するのが良い(先に分離だけ進めても、実際の
  利用箇所がないと設計の当たり外れが検証できないため)。
