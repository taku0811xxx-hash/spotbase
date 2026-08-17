// 最初の組織・最初の管理者アカウントを作るための、一度だけ実行するスクリプト。
//
// 使い方:
//   node scripts/bootstrap-admin.mjs --org "NHK" --name "山田太郎" --email "yamada@example.com" --password "初期パスワード" --category "記者"
//
// .env.local に FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY を
// 設定してから実行してください(Firebaseコンソール > プロジェクトの設定 >
// サービスアカウント > 新しい秘密鍵を生成、でダウンロードしたJSONの中身)。
//
// これで作った最初の管理者は、あとはアプリ内の「ユーザー管理」画面から
// 他のメンバーをどんどん追加できます。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env.local を簡易パースして環境変数に読み込む(dotenvパッケージへの依存を避けるため)
function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  let text;
  try {
    text = readFileSync(envPath, "utf-8");
  } catch {
    console.error(`.env.local が見つかりません: ${envPath}`);
    process.exit(1);
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      out[key] = args[i + 1];
      i++;
    }
  }
  return out;
}

async function main() {
  loadEnvLocal();
  const args = parseArgs();

  const org = args.org;
  const name = args.name;
  const email = args.email;
  const password = args.password;
  const category = args.category;

  if (!org || !name || !email || !password || !category) {
    console.error(
      "使い方: node scripts/bootstrap-admin.mjs --org \"NHK\" --name \"山田太郎\" --email \"yamada@example.com\" --password \"xxxxxxxx\" --category \"記者\""
    );
    process.exit(1);
  }
  if (password.length < 6) {
    console.error("パスワードは6文字以上にしてください");
    process.exit(1);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      ".env.local に FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY を設定してください"
    );
    process.exit(1);
  }

  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  const auth = getAuth();
  const db = getFirestore();

  console.log(`組織「${org}」の管理者アカウントを作成します...`);

  const userRecord = await auth.createUser({ email, password, displayName: name });

  await db.collection("users").doc(userRecord.uid).set({
    name,
    email,
    organizationId: userRecord.uid, // 最初の組織IDは、この管理者のuidをそのまま使う(シンプルな識別子として)
    organizationName: org,
    category,
    accessLevel: "admin",
    createdAt: new Date(),
  });

  console.log("完了しました。");
  console.log(`  ID(メールアドレス): ${email}`);
  console.log(`  パスワード: (入力した内容のまま)`);
  console.log("このアカウントでログインし、「ユーザー管理」画面から他のメンバーを追加してください。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
