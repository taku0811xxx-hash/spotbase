#!/usr/bin/env node

/**
 * Firestore データの座標確認スクリプト
 *
 * dispatch_records と sites コレクションの座標をチェックして、
 * タイトル・住所と座標のズレを検出します。
 */

import admin from "firebase-admin";

// Firebase Admin SDK の初期化（環境変数から）
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ Firebase 環境変数が設定されていません");
  console.error("   .env.local に以下を設定してください:");
  console.error("   - FIREBASE_PROJECT_ID");
  console.error("   - FIREBASE_CLIENT_EMAIL");
  console.error("   - FIREBASE_PRIVATE_KEY");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  }),
  projectId,
});

const db = admin.firestore();

async function checkRecords() {
  console.log("🔍 Firestore データの座標確認\n");
  console.log("=".repeat(80));

  // dispatch_records をチェック
  console.log("\n📋 dispatch_records コレクション:");
  const dispatchSnap = await db.collection("dispatch_records").get();

  const problematic = [];

  for (const doc of dispatchSnap.docs) {
    const data = doc.data();
    const { locationName, address, lat, lng } = data;

    if (!lat || !lng) {
      console.log(`  ⚠️  [${doc.id}] 座標が未設定: ${locationName}`);
      continue;
    }

    // 座標が川崎周辺の場合はフラグ
    const isKawasaki =
      lat >= 35.5 && lat <= 35.6 && lng >= 139.65 && lng <= 139.8;

    const isTokyo =
      lat >= 35.65 && lat <= 35.75 && lng >= 139.65 && lng <= 139.8;

    if (isKawasaki && locationName && locationName.includes("新宿")) {
      problematic.push({
        id: doc.id,
        locationName,
        address,
        lat,
        lng,
        issue: "川崎座標だが場所は新宿",
      });
      console.log(`  ❌ [${doc.id}]`);
      console.log(`     場所名: ${locationName}`);
      console.log(`     住所: ${address}`);
      console.log(`     座標: (${lat.toFixed(4)}, ${lng.toFixed(4)}) ← 川崎周辺`);
    } else if (isTokyo) {
      console.log(`  ✅ [${doc.id}] ${locationName} (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    }
  }

  console.log("\n" + "=".repeat(80));

  if (problematic.length > 0) {
    console.log(`\n⚠️  問題のあるレコード: ${problematic.length}件\n`);
    problematic.forEach((p) => {
      console.log(`   - ${p.locationName} (${p.address})`);
      console.log(`     現在座標: (${p.lat}, ${p.lng})`);
      console.log(`     問題: ${p.issue}\n`);
    });
  } else {
    console.log("\n✅ 問題のある座標は見つかりませんでした\n");
  }

  process.exit(0);
}

checkRecords().catch((err) => {
  console.error("エラー:", err);
  process.exit(1);
});
