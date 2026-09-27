// 屋外ロケ地・撮影スポットのダミーデータ(3件)を pins コレクションへ投入するスクリプト。
// 新仕様(管理ID/referenceId、図面管理/drawings、タブ型カスタム項目/customFields)に
// 対応した内容で作成する(いずれもlib/pins.tsのPin型に追加済みのオプショナル項目)。
//
// 使い方:
//   node scripts/seed-outdoor-pins.mjs
//
// 図面(drawings)のurlはFirebase Storageへの実アップロードは行わず、
// 「ダミーデータ」であることが分かるプレースホルダーURLを使用している
// (クリックしても実ファイルは開けない点に注意)。

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

// 確認用管理者(admin@spotbase.local)のorganizationId。他のseedスクリプト
// (seed-technical-locations.mjs等)と同じ値を使うことで、既存のダミーデータと
// 同じ組織・アカウントから見えるようにする。
const TEST_ORG_ID = "jPvFyIZWT6fhpDqfZDaOGQ8IZpq2";

// 図面1件分を組み立てるヘルパー。fileNameのみ指定し、id/url/uploadedBy等は
// ここでまとめて生成する。daysAgoが小さいほど新しい図面(=最新図面になりうる)。
function drawing(fileName, daysAgo, uploadedBy = "システム管理者") {
  const uploadedAt = Timestamp.fromDate(
    new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
  );
  return {
    id: `dummy-${fileName}`,
    // ダミーデータのため実ファイルはなく、プレースホルダーURLを指している
    url: `https://example.com/dummy-drawings/${encodeURIComponent(fileName)}`,
    fileName,
    uploadedAt,
    uploadedBy,
    isLatest: false, // 実際のisLatestはwithLatestFlag()で付け直す
  };
}

// drawings配列のうち、uploadedAtが最も新しい1件だけisLatest: trueにする
// (lib/pins.tsのmergeDrawings()と同じルール)。
function withLatestFlag(drawings) {
  if (drawings.length === 0) return drawings;
  const latest = drawings.reduce((a, b) =>
    b.uploadedAt.toMillis() > a.uploadedAt.toMillis() ? b : a
  );
  return drawings.map((d) => ({ ...d, isLatest: d.id === latest.id }));
}

const DUMMY_OUTDOOR_PINS = [
  {
    name: "おだいば海浜公園 砂浜・プロムナードエリア",
    referenceId: "LOC-2026-0101",
    address: "東京都港区台場1-4",
    lat: 35.6291,
    lng: 139.7745,
    photoUrls: [
      "https://picsum.photos/seed/odaiba-beach-1/1200/800",
      "https://picsum.photos/seed/odaiba-beach-2/1200/800",
    ],
    hazards:
      "一般来園者が多いため早朝推奨。ドローン撮影は飛行制限・要事前申請。三脚設置時は歩行者動線を確保すること。",
    drawings: withLatestFlag([
      drawing("台場公園_撮影可能エリア＆搬入ルート図_2026.pdf", 3),
      drawing("台場公園_全体マップ_2024.pdf", 400),
    ]),
    customFields: [
      {
        key: "搬入・駐車場・アクセス",
        value:
          "北側管理用駐車場より搬入可(高さ制限2.5m)。マイクロバスは公園東側の大型駐車場(要事前予約)を利用。",
      },
      {
        key: "通信・電波状況",
        value: "開けているため各社5G全域で超良好(下り200Mbps超)。生配信・リモートモニタリング実績あり。",
      },
      {
        key: "撮影許可・申請窓口",
        value: "東京港埠頭株式会社へ利用14日前までに申請要。占有使用料:1時間につき5,500円。",
      },
      {
        key: "控室・周辺施設",
        value: "公園内に専用控室なし。近隣のデックス東京ビーチ内のレンタルスペースを控室として手配するのが定番。",
      },
    ],
  },
  {
    name: "奥多摩・多摩川河川敷(渓谷ロケ地)",
    referenceId: "LOC-2026-0102",
    address: "東京都西多摩郡奥多摩町氷川",
    lat: 35.8089,
    lng: 139.0963,
    photoUrls: [
      "https://picsum.photos/seed/okutama-river-1/1200/800",
      "https://picsum.photos/seed/okutama-river-2/1200/800",
    ],
    hazards:
      "増水・悪天候時は立ち入り禁止。足場が悪いため出演者・スタッフ共にトレッキングシューズ必須。日没が早いため15時撤収目処。",
    drawings: withLatestFlag([
      drawing("奥多摩河川敷_機材移動ルート＆降車ポイント.pdf", 5),
    ]),
    customFields: [
      {
        key: "搬入・駐車場・アクセス",
        value: "河川敷への車両進入不可。国道沿いの町営駐車場より徒歩8分。機材運搬用に一輪車・キャリーワゴン必須。",
      },
      {
        key: "通信・電波状況",
        value: "Docomo: 4Gアンテナ2〜3本(通話可)/ au・SoftBank: 一部圏外エリアあり。ポケットWi-Fiは補強必須。",
      },
      {
        key: "電源・発電機",
        value: "現場商用電源なし。ポータブル電源(1500W級以上)または静音型ガソリン発電機を持参すること。",
      },
      {
        key: "周辺環境・トイレ",
        value: "最寄りの公衆トイレまで徒歩5分。コンビニは駅前(車で6分)が最終ポイント。",
      },
    ],
  },
  {
    name: "旧川越街道沿い 蔵造り街並みエリア",
    referenceId: "LOC-2026-0103",
    address: "埼玉県川越市幸町",
    lat: 35.9234,
    lng: 139.4828,
    photoUrls: [
      "https://picsum.photos/seed/kawagoe-street-1/1200/800",
      "https://picsum.photos/seed/kawagoe-street-2/1200/800",
    ],
    hazards:
      "観光地のため休日昼間は歩行者天国状態。路上での大がかりなライトスタンド設置は警察協議が必要。",
    drawings: withLatestFlag([
      drawing("川越街頭_カメラ位置＆交通規制図_改訂版.pdf", 2),
      drawing("川越街頭_ロケハンメモ_2025.pdf", 200),
    ]),
    customFields: [
      {
        key: "搬入・駐車場・アクセス",
        value: "早朝6:00〜8:00のみ一時停車・荷下ろし可能。日中は近隣パーキングへ回送。",
      },
      {
        key: "通信・電波状況",
        value: "全キャリア5G良好。街頭でのワイヤレスマイク運用時は観光客の電波干渉に注意(B帯チューナー推奨)。",
      },
      {
        key: "控え室・メイク場所",
        value: "徒歩2分の古民家カフェ2階を控室としてレンタル可能(1日2万円、要打診)。",
      },
      {
        key: "近隣配慮・周辺情報",
        value: "店舗前での撮影は個別に店舗許可が必要。撮影前の挨拶回り徹底。",
      },
    ],
  },
];

async function seedOutdoorPins() {
  loadEnvLocal();

  const app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
  const db = getFirestore(app);

  console.log("🌱 屋外ロケ地ダミーデータ(3件)を投入開始...");

  for (const spot of DUMMY_OUTDOOR_PINS) {
    const pinRef = db.collection("pins").doc();
    await pinRef.set({
      name: spot.name,
      referenceId: spot.referenceId,
      address: spot.address,
      lat: spot.lat,
      lng: spot.lng,
      parkingInfo: "",
      shootingSpots: "",
      ipTransmissionInfo: "",
      fpuInfo: "",
      hazards: spot.hazards,
      photoUrls: spot.photoUrls,
      shootingPhotoUrls: [],
      hazardPhotoUrls: [],
      drawings: spot.drawings,
      customFields: spot.customFields,
      organizationId: TEST_ORG_ID,
      category: "カメラマン",
      recordedBy: "システム管理者",
      recordedAt: Timestamp.now(),
    });
    console.log(`✅ PIN作成: ${spot.name} (${spot.referenceId}, ID: ${pinRef.id})`);
  }

  console.log(`\n✨ ${DUMMY_OUTDOOR_PINS.length}件の屋外ロケ地ダミーデータを投入しました`);
  process.exit(0);
}

seedOutdoorPins().catch((error) => {
  console.error("❌ 投入中にエラーが発生しました:", error);
  process.exit(1);
});
