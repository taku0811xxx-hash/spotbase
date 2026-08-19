#!/usr/bin/env node

/**
 * ジオコーディング動作確認スクリプト
 *
 * 使用法: node scripts/test-geocoding.mjs
 *
 * 「新宿駅」「東京駅」「渋谷駅」などのキーワードで、
 * 正しく該当する緯度経度・住所名が返ることを確認します。
 */

const API_BASE_URL = "http://localhost:3000";

async function geocodeQuery(query) {
  const url = new URL("/api/geocode", API_BASE_URL);
  url.searchParams.set("q", query);

  try {
    const res = await fetch(url.toString());

    if (!res.ok) {
      console.error(`API エラー: ${res.status}`);
      return [];
    }

    const results = await res.json();
    if (!Array.isArray(results)) return [];

    return results.map((d) => ({
      lat: d.lat,
      lng: d.lng,
      displayName: d.displayName,
      importance: 0, // API 側で既にソート済みなので、重要度は表示しない
    }));
  } catch (err) {
    console.error("ジオコーディング処理エラー:", err.message);
    return [];
  }
}

// 期待される座標範囲
const expectations = {
  "新宿駅": { expectedLat: 35.69, expectedLng: 139.70, tolerance: 0.05 },
  "東京駅": { expectedLat: 35.6762, expectedLng: 139.7674, tolerance: 0.05 },
  "渋谷駅": { expectedLat: 35.6595, expectedLng: 139.7004, tolerance: 0.05 },
  "品川駅": { expectedLat: 35.6313, expectedLng: 139.7397, tolerance: 0.05 },
  "横浜駅": { expectedLat: 35.4447, expectedLng: 139.6297, tolerance: 0.05 },
};

async function runTests() {
  console.log("🔍 ジオコーディング動作確認\n");
  console.log("=".repeat(80));

  let passed = 0;
  let failed = 0;

  for (const [query, { expectedLat, expectedLng, tolerance }] of Object.entries(expectations)) {
    console.log(`\n📍 キーワード: "${query}"`);
    console.log(`   期待値: (${expectedLat}, ${expectedLng})`);

    const results = await geocodeQuery(query);

    if (results.length === 0) {
      console.log("   ❌ 結果が返されませんでした");
      failed++;
      continue;
    }

    const top = results[0];
    const latDiff = Math.abs(top.lat - expectedLat);
    const lngDiff = Math.abs(top.lng - expectedLng);
    const withinTolerance = latDiff <= tolerance && lngDiff <= tolerance;

    console.log(`   結果1: ${top.displayName}`);
    console.log(`   座標: (${top.lat.toFixed(6)}, ${top.lng.toFixed(6)})`);
    console.log(`   重要度: ${top.importance.toFixed(4)}`);

    if (withinTolerance) {
      console.log("   ✅ OK");
      passed++;
    } else {
      console.log(
        `   ❌ NG (差分: ${latDiff.toFixed(4)}°, ${lngDiff.toFixed(4)}°)`
      );
      failed++;

      // 別の候補も表示
      if (results.length > 1) {
        console.log(`   結果2: ${results[1].displayName}`);
        console.log(`   座標: (${results[1].lat.toFixed(6)}, ${results[1].lng.toFixed(6)})`);
      }
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log(`\n📊 テスト結果: ${passed}/${passed + failed} 成功\n`);

  if (failed === 0) {
    console.log("✅ すべてのテストが成功しました！\n");
    process.exit(0);
  } else {
    console.log(`⚠️  ${failed}件のテストが失敗しました\n`);
    process.exit(1);
  }
}

runTests();
