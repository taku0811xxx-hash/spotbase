#!/usr/bin/env node

/**
 * Firestore データベースクリーンアップスクリプト
 *
 * 以下のコレクションをすべて削除します：
 * - dispatch_records
 * - pins
 * - sites (あれば)
 *
 * 使い方: node scripts/clear-firestore.mjs
 */

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

async function clearFirestore() {
  loadEnvLocal();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.error("❌ Firebase 環境変数が設定されていません");
    process.exit(1);
  }

  console.log("🔄 Firestore クリーンアップスクリプト実行\n");
  console.log("=".repeat(80));

  try {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
      projectId,
    });

    const db = getFirestore();

    const collections = ["dispatch_records", "pins", "sites"];

    for (const collectionName of collections) {
      console.log(`\n📍 コレクション: ${collectionName}`);

      const snapshot = await db.collection(collectionName).get();
      const count = snapshot.size;

      if (count === 0) {
        console.log(`   - データなし`);
        continue;
      }

      console.log(`   - ${count}件のドキュメント削除中...`);

      const batch = db.batch();
      let deleted = 0;

      snapshot.forEach((doc) => {
        batch.delete(doc.ref);
        deleted++;
      });

      await batch.commit();
      console.log(`   ✅ ${deleted}件削除完了`);
    }

    console.log("\n" + "=".repeat(80));
    console.log("\n✅ Firestore クリーンアップ完了\n");
    console.log("次のステップ:");
    console.log("  1. node scripts/seed-dispatch-records.mjs を実行");
    console.log("  2. ブラウザで動作確認\n");

    process.exit(0);
  } catch (err) {
    console.error("❌ エラー:", err.message);
    process.exit(1);
  }
}

clearFirestore();
