#!/usr/bin/env node

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const db = getFirestore(app);

// Target organization (from previous seed data)
const organizationId = "jPvFyIZWT6fhpDqfZDaOGQ8IZpq2";

const activeDispatches = [
  {
    locationName: "渋谷スクランブル交差点",
    address: "東京都渋谷区道玄坂2丁目",
    lat: 35.6595,
    lng: 139.704,
    incidentType: "多車線事故対応",
    category: "技術",
    recordedBy: "山田太郎",
    createdBy: "山田太郎",
    parkingInfo: "スクランブル交差点東側路上駐車可",
    shootingSpots: "交差点北西角からの俯瞰撮影",
    ipTransmissionInfo: "NTTドコモ・au 両回線OK、速度は中程度",
    fpuInfo: "中継局への見通しあり、信号強度4本",
    hazards: "交通量多し、安全ベスト必須",
    siteInfo: "商業施設多数、警察規制あり",
    status: "移動中",
    organizationId,
    parkingPhotos: [],
    shootingPhotos: [],
    notes: [],
    photos: [],
    equipmentHeaders: ["機材名", "数量", "状態"],
    equipmentRows: [
      ["カメラ", "2", "良好"],
      ["マイク", "3", "良好"],
      ["三脚", "2", "良好"],
    ],
    checkpoints: [
      {
        time: new Date(Date.now() - 15 * 60000).toISOString(),
        lat: 35.6556,
        lng: 139.6978,
        comment: "局発",
      },
    ],
    track: [
      {
        time: new Date(Date.now() - 15 * 60000).toISOString(),
        lat: 35.6556,
        lng: 139.6978,
      },
    ],
    memos: [
      {
        timestamp: new Date(Date.now() - 10 * 60000).toISOString(),
        text: "渋谷警察署に到着、規制状況確認中",
      },
      {
        timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
        text: "FPU回線確保完了",
      },
    ],
    history: [],
    createdAt: Timestamp.fromDate(new Date(Date.now() - 20 * 60000)),
    publishedAt: null,
    sourceFileHash: undefined,
  },
  {
    locationName: "品川駅東口周辺",
    address: "東京都港区高輪3丁目",
    lat: 34.6309,
    lng: 139.7386,
    incidentType: "大規模停電対応",
    category: "技術",
    recordedBy: "佐藤花子",
    createdBy: "佐藤花子",
    parkingInfo: "品川プリンスホテル駐車場利用",
    shootingSpots: "東口ロータリーからの街路撮影",
    ipTransmissionInfo: "NTTドコモ回線のみ、速度良好",
    fpuInfo: "中継局への見通しあり、信号強度5本",
    hazards: "夜間撮影、照度不足に注意",
    siteInfo: "駅前大型ビル多数、足場に注意",
    status: "現場対応中",
    organizationId,
    parkingPhotos: [],
    shootingPhotos: [],
    notes: [],
    photos: [],
    equipmentHeaders: ["機材名", "数量", "状態"],
    equipmentRows: [
      ["カメラ", "2", "良好"],
      ["照明", "2", "良好"],
      ["スタビライザー", "1", "良好"],
    ],
    checkpoints: [
      {
        time: new Date(Date.now() - 35 * 60000).toISOString(),
        lat: 34.6309,
        lng: 139.7386,
        comment: "現場到着",
      },
    ],
    track: [
      {
        time: new Date(Date.now() - 35 * 60000).toISOString(),
        lat: 34.6309,
        lng: 139.7386,
      },
    ],
    memos: [
      {
        timestamp: new Date(Date.now() - 30 * 60000).toISOString(),
        text: "停電範囲は4ブロック、東京電力対応中",
      },
      {
        timestamp: new Date(Date.now() - 20 * 60000).toISOString(),
        text: "中継車設営完了",
      },
      {
        timestamp: new Date(Date.now() - 2 * 60000).toISOString(),
        text: "通電確認、ニュース素材撮影進行中",
      },
    ],
    history: [],
    createdAt: Timestamp.fromDate(new Date(Date.now() - 45 * 60000)),
    publishedAt: null,
    sourceFileHash: undefined,
  },
  {
    locationName: "横浜港国際ターミナル",
    address: "神奈川県横浜市中区新港1丁目",
    lat: 35.4437,
    lng: 139.6452,
    incidentType: "船舶火災対応",
    category: "技術",
    recordedBy: "鈴木健二",
    createdBy: "鈴木健二",
    parkingInfo: "国際ターミナル駐車場P2",
    shootingSpots: "ターミナルビル屋上からの撮影",
    ipTransmissionInfo: "au回線のみ、速度は低速",
    fpuInfo: "中継局への見通しなし、衛星中継必要",
    hazards: "海抜低い、塩害に注意",
    siteInfo: "港湾地域、規制多し、海保指示に従う",
    status: "準備中",
    organizationId,
    parkingPhotos: [],
    shootingPhotos: [],
    notes: [],
    photos: [],
    equipmentHeaders: ["機材名", "数量", "状態"],
    equipmentRows: [
      ["カメラ", "3", "良好"],
      ["衛星回線", "1", "良好"],
      ["望遠レンズ", "2", "良好"],
    ],
    checkpoints: [],
    track: [],
    memos: [
      {
        timestamp: new Date().toISOString(),
        text: "出動指令受信、横浜港へ向かう",
      },
    ],
    history: [],
    createdAt: Timestamp.fromDate(new Date()),
    publishedAt: null,
    sourceFileHash: undefined,
  },
];

async function seedActiveDispatches() {
  try {
    console.log("🌱 Active dispatch records seeding...");

    for (const dispatch of activeDispatches) {
      const docRef = await db.collection("dispatch_records").add(dispatch);
      console.log(`✅ Created active dispatch: ${dispatch.locationName} (${docRef.id})`);
    }

    console.log(
      `\n✨ Successfully seeded ${activeDispatches.length} active dispatch records!`
    );
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding active dispatches:", error);
    process.exit(1);
  }
}

seedActiveDispatches();
