// 「ここトレ！」(APP_MODE === 'photo')向けの撮影スポットダミーデータを
// "photo_spots" コレクションへ投入するスクリプト。
// SpotBase本体のscripts/seed-tokyo-pins.mjs等("pins"コレクション)とはデータソースが
// 完全に分離しており、このスクリプトは"photo_spots"にのみ書き込む。
//
// 使い方:
//   node scripts/seed-photo-spots.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// 確認用管理者(admin@spotbase.local)のorganizationId。他のseedスクリプトと同じ値。
const TEST_ORG_ID = "jPvFyIZWT6fhpDqfZDaOGQ8IZpq2";

const DUMMY_PHOTO_SPOTS = [
  {
    name: "浅草寺 雷門前",
    description: "早朝の人が少ない時間帯が狙い目。左右対称の構図が撮りやすい。",
    address: "東京都台東区浅草2丁目3-1",
    lat: 35.7148,
    lng: 139.7967,
    photoSeed: "asakusa-kaminarimon",
    cameraGear: { camera: "SONY α7 IV", lens: "FE 24-70mm F2.8 GM" },
    exif: { fNumber: 5.6, exposureTime: "1/500", iso: 100, focalLength: "35mm", timeOfDay: "早朝" },
    accessNote: "三脚は歩行者の妨げにならない範囲でのみ使用可。イベント時は使用不可。",
  },
  {
    name: "代々木公園 大階段",
    description: "夕景の逆光シルエットが人気。",
    address: "東京都渋谷区代々木神園町2-1",
    lat: 35.6717,
    lng: 139.6947,
    photoSeed: "yoyogi-park-stairs",
    cameraGear: { camera: "Canon EOS R6", lens: "RF 50mm F1.2" },
    exif: { fNumber: 1.8, exposureTime: "1/1000", iso: 200, focalLength: "50mm", timeOfDay: "夕景" },
    accessNote: "休日は人出が多いため、平日の来訪がおすすめ。",
  },
  {
    name: "東京タワー 芝公園ビュースポット",
    description: "夜景ライトアップの定番撮影地。三脚必須。",
    address: "東京都港区芝公園4丁目",
    lat: 35.6558,
    lng: 139.7454,
    photoSeed: "tokyo-tower-shiba",
    cameraGear: { camera: "Nikon Z8", lens: "NIKKOR Z 24-120mm F4" },
    exif: { fNumber: 8, exposureTime: "2", iso: 400, focalLength: "70mm", timeOfDay: "夜景" },
    accessNote: "夜間は足元が暗いため懐中電灯推奨。三脚利用者が多く場所取りが必要。",
  },
];

async function seedPhotoSpots() {
  loadEnvLocal();

  const app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
  const db = getFirestore(app);

  console.log("🌱 ここトレ！ 撮影スポットダミーデータをphoto_spotsへ投入開始...");

  for (const spot of DUMMY_PHOTO_SPOTS) {
    const spotRef = db.collection("photo_spots").doc();
    await spotRef.set({
      name: spot.name,
      description: spot.description,
      address: spot.address,
      lat: spot.lat,
      lng: spot.lng,
      photoUrls: [
        `https://picsum.photos/seed/${spot.photoSeed}-1/1200/800`,
        `https://picsum.photos/seed/${spot.photoSeed}-2/1200/800`,
      ],
      cameraGear: spot.cameraGear,
      exif: spot.exif,
      accessNote: spot.accessNote,
      organizationId: TEST_ORG_ID,
      category: "一般",
      postedBy: "システム管理者",
      postedAt: Timestamp.now(),
    });
    console.log(`✅ photo_spot作成: ${spot.name} (ID: ${spotRef.id})`);
  }

  console.log(`\n✨ ${DUMMY_PHOTO_SPOTS.length}件の撮影スポットダミーデータを投入しました`);
  process.exit(0);
}

seedPhotoSpots().catch((error) => {
  console.error("❌ 投入中にエラーが発生しました:", error);
  process.exit(1);
});
