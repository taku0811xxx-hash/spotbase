// Firestore に「技術」分類の現場ダミーデータを一括挿入するスクリプト
//
// 使い方:
//   node scripts/seed-technical-locations.mjs
//
// 以下の条件でダミーデータを自動生成・挿入:
// - 分類: 技術
// - 現場: テレビ中継・技術設営でよく使われる10箇所
// - 各項目: 技術視点での現場情報（携帯回線/IP伝送状況、FPU伝送状況、電源確保、駐車場所、危険箇所）
// - 組織ID・各現場: pins コレクション + dispatch_records コレクションに紐付け

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

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

// 確認用管理者 (admin@spotbase.local) の organizationId:
const TEST_ORG_ID = "jPvFyIZWT6fhpDqfZDaOGQ8IZpq2";

// 技術分類の現場ダミーデータ
const DUMMY_LOCATIONS = [
  {
    name: "東京駅 丸の内駅前広場",
    address: "東京都千代田区丸の内1丁目",
    lat: 35.6762,
    lng: 139.7674,
    parkingInfo: "東京駅直結の駐車場（丸の内ビル、JPタワー等）。料金高めだが確実。距離により30分で100～200円。",
    shootingSpots: "駅前広場が開放的。丸ビルの屋上から全景撮影可能。ビジネス街のため背景が映えやすい。",
    ipTransmissionInfo: "au・docomo・softbank全キャリア良好。ビジネス街のため電波強度安定。5G対応エリア。",
    fpuInfo: "東京タワーへの見通しあり。丸の内ビル周辺はビル影の可能性。事前に信号レベルテスト推奨。",
    hazards: "駅周辺は人通り多く、機材・ケーブル配置に注意。夜間撮影時は照明確保必須。交通量多いため安全確保が重要。",
  },
  {
    name: "豊洲市場 6街区屋上",
    address: "東京都江東区豊洲6丁目",
    lat: 35.6465,
    lng: 139.7919,
    parkingInfo: "豊洲市場正面駐車場利用。市場営業時間中は混雑。営業終了後（22時以降）が狙い目。",
    shootingSpots: "屋上からはお台場・レインボーブリッジが全景で撮影可能。風が強いため機材固定必須。",
    ipTransmissionInfo: "江東区内は au・docomo・softbank全キャリア良好。豊洲新市場周辺も電波強度高い。",
    fpuInfo: "スカイツリー中継局への見通しあり。屋上の風で受信アンテナがぶれやすいため、固定用の風対策が必須。",
    hazards: "屋上の風が非常に強い。ロープワークで機材固定必須。転落防止のハーネス着用推奨。屋上の冷房機械からの熱風注意。",
  },
  {
    name: "浅草寺 雷門前",
    address: "東京都台東区浅草1丁目",
    lat: 35.7149,
    lng: 139.7966,
    parkingInfo: "浅草寺周辺に複数の有料駐車場あり。朝8時までは比較的空いている。観光客対応の混雑時間帯を避ける。",
    shootingSpots: "雷門のシンボリックな赤提灯が映える。仲見世通りからの引き・引きショット推奨。昼間の日差しは強烈。",
    ipTransmissionInfo: "台東区は docomo・au・softbank全キャリア対応。仲見世通りは狭いため、屋上・高所からの中継推奨。",
    fpuInfo: "スカイツリーへの見通しあり。ただし仲見世通りの建物が高いため、屋上または高所への移動が必須。",
    hazards: "観光客の人手が多く、機材・ケーブルの踏みつけ・引っかけリスク高い。人員配置による安全管理が重要。",
  },
  {
    name: "日比谷公園 野外音楽堂周辺",
    address: "東京都千代田区日比谷公園1",
    lat: 35.6746,
    lng: 139.7548,
    parkingInfo: "日比谷公園の地下駐車場（出入口3箇所）。台数限定だが確実。1時間300円程度。",
    shootingSpots: "野外音楽堂は背景に都心のビル街。音声も高品質で録音可能。客席からのワイド撮影も可能。",
    ipTransmissionInfo: "丸の内・千代田区のため、au・docomo・softbank全キャリア極めて良好。5G対応。",
    fpuInfo: "東京タワーへの見通しあり。公園内の樹木により若干の電波遮蔽の可能性。事前にテスト推奨。",
    hazards: "公園利用者が多い季節・時間帯を避ける。イベント開催時は事前許可・調整が必須。ケーブル配置は引っかけ防止に注意。",
  },
  {
    name: "お台場海浜公園 展望デッキ",
    address: "東京都港区台場1丁目",
    lat: 35.6293,
    lng: 139.7758,
    parkingInfo: "ダイバーシティ東京、アクアシティお台場の駐車場利用。2000台以上の大型駐車場。料金は30分250円程度。",
    shootingSpots: "レインボーブリッジ、東京タワーを背景にしたパノラマ撮影が可能。夜間夜景撮影も映えやすい。",
    ipTransmissionInfo: "港区は au・docomo・softbank全キャリア優秀。ウォーターフロントのため電波反射に注意（多重反射の可能性）。",
    fpuInfo: "東京タワー・スカイツリー両方への見通しあり。レインボーブリッジ経由で相互回線も可能。信頼性高い。",
    hazards: "海風が強い。レインボーブリッジの風による建造物の揺れで、映像ぶれの可能性。大型ジブを立てる際は風対策必須。",
  },
  {
    name: "国立競技場 千駄ヶ谷門付近",
    address: "東京都新宿区霞ヶ丘町10-1",
    lat: 35.6758,
    lng: 139.7134,
    parkingInfo: "国立競技場周辺に複数駐車場。イベント開催時は事前予約推奨。通常は比較的空いている。",
    shootingSpots: "競技場の建築デザインがモダン。南北からのアングルで異なる表情を撮影可能。光の当たり方で時間帯別撮影推奨。",
    ipTransmissionInfo: "新宿区は au・docomo・softbank全キャリア極めて良好。スポーツイベント時も安定。",
    fpuInfo: "東京タワーへの見通しあり。競技場周辺の新築ビルが増え、電波状況が年々変化。定期的なテスト推奨。",
    hazards: "国立競技場はセキュリティが厳しい。撮影許可・事前調整が必須。周辺工事が進行中のため、進入禁止区域に注意。",
  },
  {
    name: "渋谷 MIYASHITA PARK 前",
    address: "東京都渋谷区神宮前6丁目",
    lat: 35.6595,
    lng: 139.7007,
    parkingInfo: "MIYASHITA PARK 直結駐車場（800台）。混雑時は満車。近隣にコインパーキング多数。",
    shootingSpots: "渋谷の象徴的な繁華街。MIYASHITA PARK のロゴが映えやすい。道玄坂からのワイド撮影も可能。",
    ipTransmissionInfo: "渋谷は au・docomo・softbank全キャリア良好。5G対応エリア。商業地のため電波強度安定。",
    fpuInfo: "東京タワーへの見通しあり。高層ビルが密集しているため、受信位置の最適化が重要。屋上テスト推奨。",
    hazards: "歩行者の人出が多い時間帯は機材配置に注意。夜間撮影時はセキュリティガード配置推奨。交差点の信号に注意。",
  },
  {
    name: "六本木ヒルズ 66プラザ",
    address: "東京都港区六本木6丁目",
    lat: 35.6658,
    lng: 139.7294,
    parkingInfo: "六本木ヒルズの地下駐車場（大規模）。事前に駐車証を入手すると便利。料金は1時間300～400円。",
    shootingSpots: "66プラザは開放的でイベント適地。毛利庭園を背景に撮影可能。360度のビル視景撮影も可能。",
    ipTransmissionInfo: "港区のため au・docomo・softbank全キャリア優秀。高層ビル反射による電波ゆらぎの可能性。",
    fpuInfo: "東京タワー・スカイツリー両方への見通しあり。六本木ヒルズタワーの高さを活かした中継拠点として最適。",
    hazards: "ビジネス街であり、夜間撮影時は事前許可が必須。66プラザのイベント開催時は安全柵設置状況を確認。",
  },
  {
    name: "横浜赤レンガ倉庫 イベント広場",
    address: "神奈川県横浜市中区新港1丁目",
    lat: 35.4467,
    lng: 139.6403,
    parkingInfo: "赤レンガ倉庫専用駐車場のほか、近隣に大型駐車場多数。みなとみらい駅直結で公共交通も便利。",
    shootingSpots: "赤レンガの歴史的建造物が映える。横浜湾の夜景と組み合わせた撮影が人気。イベント広場は自由度高い。",
    ipTransmissionInfo: "横浜市は au・docomo・softbank全キャリア良好。港湾部は電波反射による多重反射注意。",
    fpuInfo: "横浜タワー、横浜スタジアムへの見通しあり。海風の影響で受信アンテナがぶれやすいため、固定が重要。",
    hazards: "港湾部のため塩分による機材腐食の可能性。ケーブルの塩吹対策と洗浄が重要。夜間撮影時は防犯対策も必須。",
  },
  {
    name: "幕張メッセ 国際展示場前",
    address: "千葉県千葉市美浜区中瀬2丁目",
    lat: 35.6296,
    lng: 140.0616,
    parkingInfo: "幕張メッセの大型駐車場（2000台以上）。イベント開催時は混雑。公共交通（海浜幕張駅）も充実。",
    shootingSpots: "メッセの近代的な建築がシンボル。東京湾を背景にしたパノラマ撮影も可能。展示場内のイベント撮影も可。",
    ipTransmissionInfo: "千葉市のため au・docomo・softbank全キャリア対応。沿岸部のため塩分の影響で電波ノイズの可能性。",
    fpuInfo: "東京タワー・スカイツリーへの見通しあり。ただし距離があるため、信号レベルテストは必須。",
    hazards: "大規模イベント会場のため、開催時期のセキュリティが厳しい。撮影許可・事前調整が絶対必須。",
  },
];

async function seedLocations() {
  loadEnvLocal();

  const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || "",
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID || "",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL || "",
  };

  const app = initializeApp({
    credential: cert(serviceAccount),
  });

  const db = getFirestore(app);

  try {
    console.log("🌱 技術分類の現場ダミーデータを作成開始...");

    for (const location of DUMMY_LOCATIONS) {
      // 1. pins コレクションに現場を作成
      const pinRef = db.collection("pins").doc();
      await pinRef.set({
        name: location.name,
        address: location.address,
        lat: location.lat,
        lng: location.lng,
        parkingInfo: location.parkingInfo,
        shootingSpots: location.shootingSpots,
        ipTransmissionInfo: location.ipTransmissionInfo,
        fpuInfo: location.fpuInfo,
        hazards: location.hazards,
        photoUrls: [],
        shootingPhotoUrls: [],
        hazardPhotoUrls: [],
        organizationId: TEST_ORG_ID,
        category: "技術",
        recordedBy: "システム管理者",
        recordedAt: Timestamp.now(),
      });

      console.log(`✅ PIN 作成: ${location.name} (ID: ${pinRef.id})`);

      // 2. dispatch_records コレクションに出動記録を作成
      const dispatchRef = db.collection("dispatch_records").doc();
      await dispatchRef.set({
        locationName: location.name,
        address: location.address,
        lat: location.lat,
        lng: location.lng,
        incidentType: "定期的な技術現場調査・動作確認",
        siteInfo: `${location.name}での技術設営確認。${location.ipTransmissionInfo}`,
        sitePhotos: [],
        parkingInfo: location.parkingInfo,
        parkingPhotos: [],
        shootingSpots: location.shootingSpots,
        shootingPhotos: [],
        ipTransmissionInfo: location.ipTransmissionInfo,
        ipTransmissionPhotos: [],
        fpuInfo: location.fpuInfo,
        fpuPhotos: [],
        hazards: location.hazards,
        hazardPhotos: [],
        checkpoints: [
          {
            time: new Date().toISOString(),
            lat: location.lat,
            lng: location.lng,
            comment: "現場確認",
          },
        ],
        track: [],
        equipmentHeaders: ["機材名", "状態", "備考"],
        equipmentRows: [],
        notes: [
          {
            title: "技術確認",
            body: "携帯回線・FPU伝送状況を確認。次回出動時の参考情報として保存。",
          },
        ],
        photos: [],
        organizationId: TEST_ORG_ID,
        category: "技術",
        recordedBy: "システム管理者",
        status: "published",
        publishedAt: Timestamp.now(),
        history: [],
        createdAt: Timestamp.now(),
      });

      console.log(`✅ DispatchRecord 作成: ${location.name} (ID: ${dispatchRef.id})`);
    }

    console.log("\n✨ 10個の技術現場ダミーデータ作成完了！");
    process.exit(0);
  } catch (error) {
    console.error("❌ エラー:", error);
    process.exit(1);
  }
}

seedLocations();
