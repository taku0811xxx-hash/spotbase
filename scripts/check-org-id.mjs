// Firestore の users コレクションから organizationId を確認するスクリプト

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env.local を簡易パースして環境変数に読み込む
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

async function main() {
  loadEnvLocal();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    console.error("FIREBASE_PROJECT_ID が設定されていません");
    process.exit(1);
  }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey,
  };

  if (!privateKey) {
    console.error(
      ".env.local に FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY を設定してください"
    );
    process.exit(1);
  }

  initializeApp({
    credential: cert(serviceAccount),
  });

  const db = getFirestore();

  console.log("📋 Firestore の users コレクションを確認しています...\n");

  try {
    const snapshot = await db.collection("users").get();

    if (snapshot.empty) {
      console.log("❌ users コレクションにユーザーがいません");
      process.exit(1);
    }

    console.log(`✅ 合計 ${snapshot.size} 件のユーザーが見つかりました\n`);

    snapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`ユーザーID (uid): ${doc.id}`);
      console.log(`  名前: ${data.name || "N/A"}`);
      console.log(`  メール: ${data.email || "N/A"}`);
      console.log(`  organizationId: ${data.organizationId || "N/A"}`);
      console.log(`  organizationName: ${data.organizationName || "N/A"}`);
      console.log(`  category: ${data.category || "N/A"}`);
      console.log(`  accessLevel: ${data.accessLevel || "N/A"}`);
      console.log("");
    });
  } catch (error) {
    console.error("❌ エラーが発生しました:", error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
