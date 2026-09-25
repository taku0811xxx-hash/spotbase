import type { CapacitorConfig } from '@capacitor/cli';

// NEXT_PUBLIC_APP_MODE=photo (「ここトレ！」) の場合だけ別アプリとして構成する。
// npm run cap:sync:photo / cap:open:photo がこの環境変数をセットして呼び出す。
const isPhotoMode = process.env.NEXT_PUBLIC_APP_MODE === 'photo';

const spotbaseConfig: CapacitorConfig = {
  appId: 'com.spotbase.app',
  appName: 'SpotBase',
  // SpotBase本体はFirebase Admin SDK / Anthropic API を使うAPIルートに依存しており、
  // static export(`output: 'export'`)とは相性が悪い(サーバー機能が動かない)。
  // そのため webDir はビルド成果物の置き場として最低限用意しつつ、
  // 実際の画面表示は server.url 経由でVercel上の本番アプリをそのまま読み込む
  // (Capacitorのネイティブブリッジ/プラグインだけをWebViewに注入する構成)。
  webDir: 'out',
  server: {
    // 開発中は下のURLをローカル開発サーバ(例: 'http://<PCのLAN IP>:3000')に
    // 差し替えて実機確認できる。cleartext: true はhttpのローカル開発時のみ有効化する。
    url: 'https://spotbase-theta.vercel.app',
    cleartext: false,
  },
};

const photoConfig: CapacitorConfig = {
  appId: 'com.cocotore.app',
  appName: 'ここトレ！',
  // 「ここトレ！」はFirestoreクライアントSDKのみを使う(サーバーAPIルート非依存)ため、
  // scripts/build-photo.mjs が生成した静的書き出し(out/)をそのままWebViewへ同梱できる。
  // そのため server.url は指定せず、ローカルアセットを読み込む本番仕様にしている。
  webDir: 'out',
};

const config: CapacitorConfig = isPhotoMode ? photoConfig : spotbaseConfig;

export default config;
