// マルチプロダクト基盤: 同一リポジトリから複数アプリ(SpotBase本体/フォトスポット/散歩ログ)を
// 切り替えて動かすための表示モード設定。
//
// NEXT_PUBLIC_APP_MODE(ビルド時環境変数)でモードを固定する方式を採用している
// (ランタイムでの動的切り替えは行わない。プロダクトごとに別のVercelプロジェクト/
// 環境変数でデプロイする前提のため)。詳細な設計方針は
// docs/MULTI_PRODUCT_ARCHITECTURE.md を参照。

export type AppMode = "pro" | "photo" | "walk";

const APP_MODES: AppMode[] = ["pro", "photo", "walk"];

function isAppMode(value: string | undefined): value is AppMode {
  return !!value && (APP_MODES as string[]).includes(value);
}

// 現在の表示モードを返す。未設定・不正な値の場合はSpotBase本体("pro")にフォールバックする。
export function getAppMode(): AppMode {
  const raw = process.env.NEXT_PUBLIC_APP_MODE;
  return isAppMode(raw) ? raw : "pro";
}

export const APP_MODE: AppMode = getAppMode();

// title: ブラウザタブ・ヘッダーのロゴ等に使う短いワードマーク。
// titleTemplate: ページ単位でtitleを持つ場合の展開テンプレート(%sがページ側のtitleに置換される)。
//   app/layout.tsxのmetadata.titleに渡し、サブページで`export const metadata = { title: "..." }`
//   のように書くだけで「〇〇 | ここトレ！」の形式になるようにするための土台(未使用ページがあっても害はない)。
export const APP_MODE_META: Record<
  AppMode,
  { title: string; description: string; titleTemplate: string }
> = {
  pro: {
    title: "SpotBase + 現場記録",
    description: "放送・報道クルー向け現場ロケハン情報管理",
    titleTemplate: "%s | SpotBase",
  },
  photo: {
    title: "ここトレ！ - 写真で探すフォトスポット共有アプリ",
    description: "撮影スポットを写真で探して共有できる「ここトレ！」。カメラ・レンズ・撮影設定つきで投稿できます。",
    titleTemplate: "%s | ここトレ！",
  },
  walk: {
    title: "散歩ログ(仮)",
    description: "散歩・Vlogの記録・共有",
    titleTemplate: "%s | 散歩ログ",
  },
};
