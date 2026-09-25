import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import {
  initializeAuth,
  getAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";

// Firebaseコンソールの「プロジェクトの設定」からコピーして
// .env.local に以下の形式で設定してください。
// NEXT_PUBLIC_FIREBASE_API_KEY=...
// NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
// NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
// NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
// NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
// NEXT_PUBLIC_FIREBASE_APP_ID=...

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Next.jsのホットリロードで多重初期化されないようにガードする
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

// 認証はメールアドレス+パスワードのみを使用しており(招待コード方式は廃止済み)、
// Google等のポップアップ/リダイレクトサインインは一切行っていない。
// `getAuth(app)`はデフォルトで`browserPopupRedirectResolver`を暗黙的に組み込み、
// 初期化時にauthDomain向けのクロスドメインiframe(gapi.iframes)を自動で
// 読み込もうとする。これは通常のブラウザでは問題にならないが、Capacitor(iOS)の
// `capacitor://localhost`のような非http(s)オリジンでは、そのiframeとの
// postMessage/CORSハンドシェイクが失敗し、
// 「TypeError: undefined is not an object (evaluating 'gapi.iframes.getContext')」や
// 「Cross-origin redirection ... denied by CORS」が発生してアプリがフリーズする。
// ポップアップ/リダイレクトサインインを使わないため`popupRedirectResolver`を
// 明示的に指定せず(=undefined)、`initializeAuth`で永続化方式のみを指定して
// このモジュールの読み込み自体を止める。
export const auth = (() => {
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
    });
  } catch {
    // Next.jsのホットリロード等で既に初期化済みの場合はここに来るため、
    // 既存のインスタンスを取得するだけでよい。
    return getAuth(app);
  }
})();
