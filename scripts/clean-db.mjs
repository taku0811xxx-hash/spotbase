#!/usr/bin/env node

/**
 * ダミーデータ・クリーンアップスクリプト
 *
 * テスト用に投入した現場データ(pins / field_notes / dispatch_records / incidents)と、
 * 管理者(accessLevel: "admin")以外のテスト用ユーザーデータ(users)をFirestoreから削除する。
 *
 * 安全のため、デフォルトは「ドライラン」(削除対象の件数・内容を表示するだけで、
 * 実際には何も削除しない)。実際に削除するには --execute フラグを明示的に付ける。
 *
 * 使い方:
 *   node scripts/clean-db.mjs                    # ドライラン(削除対象を確認するだけ)
 *   node scripts/clean-db.mjs --execute           # 実際に削除を実行
 *   node scripts/clean-db.mjs --execute --skip-users   # usersコレクションは対象外にする
 *   node scripts/clean-db.mjs --execute --collections=pins,field_notes  # 対象コレクションを絞る
 *
 * 注意:
 *   - Firebase Authenticationのアカウント自体は削除しない(Firestoreの users
 *     ドキュメントのみが対象)。Authアカウントも削除したい場合はFirebaseコンソールから
 *     別途手動で行うこと。
 *   - 「管理者」の判定は users ドキュメントの accessLevel フィールドが "admin" かどうかで行う
 *     (lib/userProfile.ts の AccessLevel 型・scripts/bootstrap-admin.mjs の初期登録と同じ基準)。
 *   - このスクリプトはCLIから手動実行する前提で、npm run clean-db (package.jsonに追加予定)
 *     以外の形でアプリ起動時に自動実行されることはない。
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_SITE_DATA_COLLECTIONS = ["pins", "field_notes", "dispatch_records", "incidents"];

// .env.local を簡易パースして環境変数に読み込む(他のscripts/*.mjsと同じパターン)
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

function parseArgs(argv) {
  const execute = argv.includes("--execute");
  const skipUsers = argv.includes("--skip-users");
  const collectionsArg = argv.find((a) => a.startsWith("--collections="));
  const collections = collectionsArg
    ? collectionsArg
        .slice("--collections=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_SITE_DATA_COLLECTIONS;
  return { execute, skipUsers, collections };
}

// バッチ削除(Firestoreの1バッチ最大500件制限に合わせて分割)
async function deleteDocsInBatches(db, docs) {
  const BATCH_SIZE = 500;
  let deleted = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

async function cleanCollection(db, collectionName, { execute }) {
  console.log(`\n📍 コレクション: ${collectionName}`);
  const snapshot = await db.collection(collectionName).get();
  if (snapshot.empty) {
    console.log("   - データなし");
    return { total: 0, deleted: 0 };
  }
  console.log(`   - 対象件数: ${snapshot.size}件`);
  if (!execute) {
    console.log("   - (ドライラン: 実際には削除していません)");
    return { total: snapshot.size, deleted: 0 };
  }
  const deleted = await deleteDocsInBatches(db, snapshot.docs);
  console.log(`   ✅ ${deleted}件削除完了`);
  return { total: snapshot.size, deleted };
}

// users コレクションは、accessLevel: "admin" のドキュメントだけを残し、それ以外
// (テスト用ダミーユーザー等)を削除対象とする。
async function cleanUsers(db, { execute }) {
  console.log(`\n📍 コレクション: users (管理者以外を削除対象とする)`);
  const snapshot = await db.collection("users").get();
  if (snapshot.empty) {
    console.log("   - データなし");
    return { total: 0, deleted: 0, keptAdmins: 0 };
  }

  const adminDocs = [];
  const nonAdminDocs = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.accessLevel === "admin") {
      adminDocs.push(doc);
    } else {
      nonAdminDocs.push(doc);
    }
  });

  console.log(`   - 全${snapshot.size}件 / 管理者${adminDocs.length}件(保持) / それ以外${nonAdminDocs.length}件(削除対象)`);
  if (nonAdminDocs.length > 0) {
    console.log("   - 削除対象の内訳(uid: name / email):");
    for (const doc of nonAdminDocs) {
      const d = doc.data();
      console.log(`     - ${doc.id}: ${d.name ?? "(名前未設定)"} / ${d.email ?? "(メール未設定)"}`);
    }
  }

  if (!execute) {
    console.log("   - (ドライラン: 実際には削除していません)");
    return { total: snapshot.size, deleted: 0, keptAdmins: adminDocs.length };
  }
  if (nonAdminDocs.length === 0) {
    return { total: snapshot.size, deleted: 0, keptAdmins: adminDocs.length };
  }
  const deleted = await deleteDocsInBatches(db, nonAdminDocs);
  console.log(`   ✅ ${deleted}件削除完了(管理者${adminDocs.length}件は保持)`);
  return { total: snapshot.size, deleted, keptAdmins: adminDocs.length };
}

async function main() {
  const { execute, skipUsers, collections } = parseArgs(process.argv.slice(2));
  loadEnvLocal();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.error("❌ Firebase 環境変数(FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)が設定されていません");
    process.exit(1);
  }

  console.log("🔄 ダミーデータ・クリーンアップスクリプト");
  console.log(`   モード: ${execute ? "⚠️  本番実行(実際に削除します)" : "🔍 ドライラン(削除対象の確認のみ)"}`);
  console.log(`   対象プロジェクト: ${projectId}`);
  console.log(`   対象コレクション: ${collections.join(", ")}${skipUsers ? "" : ", users(管理者以外)"}`);
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

    const results = {};
    for (const collectionName of collections) {
      results[collectionName] = await cleanCollection(db, collectionName, { execute });
    }
    if (!skipUsers) {
      results.users = await cleanUsers(db, { execute });
    }

    console.log("\n" + "=".repeat(80));
    if (execute) {
      console.log("\n✅ クリーンアップ完了\n");
    } else {
      console.log("\n🔍 ドライラン完了。実際に削除するには --execute を付けて再実行してください。\n");
      console.log("   例: node scripts/clean-db.mjs --execute\n");
    }
    process.exit(0);
  } catch (err) {
    console.error("❌ エラー:", err.message);
    process.exit(1);
  }
}

main();
