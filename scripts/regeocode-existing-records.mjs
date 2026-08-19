#!/usr/bin/env node

/**
 * Firestore 既存レコードの座標再取得・更新スクリプト
 *
 * タイトルと座標がズレているレコードを特定して、
 * 修正した geocodeQuery() を使って正しい座標を再取得し、
 * Firestore のデータを一括更新します。
 */

import admin from "firebase-admin";

// Firebase Admin SDK の初期化（環境変数から）
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ Firebase 環境変数が設定されていません");
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

// 座標を逆ジオコード（座標 → 住所）
async function reverseGeocodeCoord(lat, lng) {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "json");
    url.searchParams.set("accept-language", "ja");
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url.toString(), {
      headers: { "Accept-Language": "ja" },
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data.display_name || null;
  } catch (err) {
    console.error("逆ジオコード失敗:", err.message);
    return null;
  }
}

// 日本式住所をフォーマット
function formatJapaneseAddress(address) {
  if (!address) return "";

  const parts = [
    address.state,
    address.city ?? address.town ?? address.village,
    address.city_district,
    address.suburb ?? address.neighbourhood,
    address.road,
    address.house_number,
  ].filter(Boolean);

  if (parts.length === 0) return "";

  return parts.join("");
}

// 場所名から座標を取得（ジオコード）
async function geocodeLocation(locationName) {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", locationName);
    url.searchParams.set("format", "json");
    url.searchParams.set("countrycodes", "jp");
    url.searchParams.set("accept-language", "ja");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "10");
    url.searchParams.set("viewbox", "138.4,34.0,141.5,36.5");
    url.searchParams.set("bounded", "1");

    const res = await fetch(url.toString(), {
      headers: {
        "Accept-Language": "ja",
        "User-Agent": "SpotBase/1.0 (Broadcast location management system)",
      },
    });

    if (!res.ok) {
      console.error(`Nominatim API エラー: ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    // 日本座標範囲でフィルタリング
    const filtered = data.filter((d) => {
      const lat = parseFloat(d.lat);
      const lng = parseFloat(d.lon);
      return lat >= 30 && lat <= 46 && lng >= 130 && lng <= 146;
    });

    if (filtered.length === 0) return null;

    // 重要度でソート
    const sorted = filtered.sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));
    const top = sorted[0];

    return {
      lat: parseFloat(top.lat),
      lng: parseFloat(top.lon),
      displayName: formatJapaneseAddress(top.address || {}),
    };
  } catch (err) {
    console.error("ジオコード失敗:", err.message);
    return null;
  }
}

// 座標が川崎周辺かどうかを判定
function isKawasaki(lat, lng) {
  return lat >= 35.5 && lat <= 35.6 && lng >= 139.65 && lng <= 139.8;
}

async function regecodeRecords() {
  console.log("🔄 Firestore レコードの座標再取得・更新\n");
  console.log("=".repeat(80));

  let updated = 0;
  let errors = 0;
  let skipped = 0;

  // dispatch_records をチェック
  console.log("\n📋 dispatch_records コレクション処理中...\n");
  const dispatchSnap = await db.collection("dispatch_records").get();

  for (const doc of dispatchSnap.docs) {
    const data = doc.data();
    const { locationName, lat, lng } = data;

    if (!lat || !lng) {
      console.log(`  ⏭️  ${locationName || "無名"} (座標なし) - スキップ`);
      skipped++;
      continue;
    }

    // 川崎座標でない場合はスキップ
    if (!isKawasaki(lat, lng)) {
      console.log(`  ✅ ${locationName} - 座標正常 (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
      skipped++;
      continue;
    }

    // 川崎座標だが場所名が異なる場合は更新
    console.log(`  🔍 ${locationName} - 川崎座標を修正中...`);
    const geocoded = await geocodeLocation(locationName);

    if (!geocoded) {
      console.log(`     ❌ ジオコード失敗`);
      errors++;
      continue;
    }

    // Firestore 更新
    try {
      await db.collection("dispatch_records").doc(doc.id).update({
        lat: geocoded.lat,
        lng: geocoded.lng,
        address: geocoded.displayName,
      });
      console.log(`     ✅ 更新完了: (${geocoded.lat.toFixed(4)}, ${geocoded.lng.toFixed(4)})`);
      updated++;
    } catch (err) {
      console.error(`     ❌ 更新失敗:`, err.message);
      errors++;
    }
  }

  // sites コレクションも処理
  console.log("\n📍 sites コレクション処理中...\n");
  const sitesSnap = await db.collection("sites").get();

  for (const doc of sitesSnap.docs) {
    const data = doc.data();
    const { name, lat, lng } = data;

    if (!lat || !lng) {
      console.log(`  ⏭️  ${name || "無名"} (座標なし) - スキップ`);
      skipped++;
      continue;
    }

    if (!isKawasaki(lat, lng)) {
      console.log(`  ✅ ${name} - 座標正常`);
      skipped++;
      continue;
    }

    console.log(`  🔍 ${name} - 川崎座標を修正中...`);
    const geocoded = await geocodeLocation(name);

    if (!geocoded) {
      console.log(`     ❌ ジオコード失敗`);
      errors++;
      continue;
    }

    try {
      await db.collection("sites").doc(doc.id).update({
        lat: geocoded.lat,
        lng: geocoded.lng,
        address: geocoded.displayName,
      });
      console.log(`     ✅ 更新完了: (${geocoded.lat.toFixed(4)}, ${geocoded.lng.toFixed(4)})`);
      updated++;
    } catch (err) {
      console.error(`     ❌ 更新失敗:`, err.message);
      errors++;
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log(`\n📊 処理結果:`);
  console.log(`   更新: ${updated}件`);
  console.log(`   スキップ: ${skipped}件`);
  console.log(`   エラー: ${errors}件\n`);

  process.exit(errors > 0 ? 1 : 0);
}

regecodeRecords().catch((err) => {
  console.error("エラー:", err);
  process.exit(1);
});
