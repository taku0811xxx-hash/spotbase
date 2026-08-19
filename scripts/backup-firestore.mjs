#!/usr/bin/env node

import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Firebase Admin SDK を初期化
const serviceAccountPath = path.join(__dirname, "../firebase-service-account.json");
if (!fs.existsSync(serviceAccountPath)) {
  console.error("Error: firebase-service-account.json が見つかりません");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// バックアップデータを取得
async function backupFirestore() {
  console.log("Starting Firestore backup...");

  const backup = {
    timestamp: new Date().toISOString(),
    collections: {},
  };

  try {
    // コレクション一覧を取得
    const collectionsSnapshot = await db.listCollections();
    console.log(`Found ${collectionsSnapshot.length} collections`);

    for (const collectionRef of collectionsSnapshot) {
      const collectionName = collectionRef.id;
      console.log(`  Backing up collection: ${collectionName}`);

      const docsSnapshot = await collectionRef.get();
      const docs = [];

      docsSnapshot.forEach((doc) => {
        const data = doc.data();
        // Timestamp をISO文字列に変換
        const serialized = serializeData(data);
        docs.push({
          id: doc.id,
          ...serialized,
        });
      });

      backup.collections[collectionName] = docs;
      console.log(`    → Backed up ${docs.length} documents`);
    }

    // ファイルに保存
    const backupDir = path.join(__dirname, "../backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const date = new Date();
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const filename = `${dateStr}-backup.json`;
    const filepath = path.join(backupDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));
    console.log(`\n✅ Backup completed: ${filepath}`);
    console.log(`Total size: ${(fs.statSync(filepath).size / 1024).toFixed(2)} KB`);
  } catch (error) {
    console.error("Backup failed:", error);
    process.exit(1);
  } finally {
    await admin.app().delete();
  }
}

// Timestamp をISO文字列に変換する関数
function serializeData(data) {
  if (data === null || data === undefined) {
    return data;
  }

  if (data instanceof admin.firestore.Timestamp) {
    return data.toDate().toISOString();
  }

  if (Array.isArray(data)) {
    return data.map((item) => serializeData(item));
  }

  if (typeof data === "object") {
    const serialized = {};
    for (const [key, value] of Object.entries(data)) {
      serialized[key] = serializeData(value);
    }
    return serialized;
  }

  return data;
}

// 実行
backupFirestore();
