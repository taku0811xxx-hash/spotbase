import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.spotbase.app',
  appName: 'SpotBase',
  // このアプリはFirebase Admin SDK / Anthropic API を使うAPIルートに
  // 依存しており、`next export`静的出力とは相性が悪い(サーバー機能が動かない)。
  // そのため webDir はビルド成果物の置き場として最低限用意しつつ、
  // 実際の画面表示は server.url 経由でVercel上の本番アプリをそのまま読み込む
  // (Capacitorのネイティブブリッジ/プラグインだけをWebViewに注入する構成)。
  webDir: 'out',
  server: {
    // 開発中は下のURLをローカル開発サーバ(例: 'http://<PCのLAN IP>:3000')に
    // 差し替えて実機確認できる。cleartext: true はhttpのローカル開発時のみ有効化する。
    url: 'https://spotbase.vercel.app',
    cleartext: false,
  },
};

export default config;
