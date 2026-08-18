// Firestore に開発・動作確認用のダミー出動記録を一括挿入するスクリプト
//
// 使い方:
//   node scripts/seed-dispatch-records.mjs
//
// 以下の条件でダミーデータを自動生成・挿入:
// - status: 'published' (正式提出済み)
// - 分類: 記者、技術、カメラマン、ディレクターをそれぞれ網羅
// - 出動内容: 現実的で多様なシナリオ
// - 各項目: 現場で役立つ具体的な情報
// - 住所・位置情報: 実在する地点の座標を使用

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

// ダミーデータのセット定義（Firestore のスキーマに対応）
// organizationId は実際のユーザーの UID を使用します
// 確認用管理者 (admin@spotbase.local) の organizationId:
const TEST_ORG_ID = "jPvFyIZWT6fhpDqfZDaOGQ8IZpq2";

const DUMMY_RECORDS = [
  {
    // データ1: 八王子市・大雨対応（技術）
    organizationId: TEST_ORG_ID,
    category: "技術",
    recordedBy: "田中太郎（技術）",
    locationName: "八王子市役所周辺",
    address: "東京都八王子市元本郷町4丁目21-1",
    lat: 35.66527,
    lng: 139.3314,
    incidentType: "台風接近に伴う河川増水対応",
    siteInfo:
      "浅川が増水し、上流の土砂崩れリスク高い。市役所からの距離約2km。現場の人員・機材状況を遠隔監視中。",
    parkingInfo:
      "市役所前のコインパーキング利用可。満車時は南側の民間パーキング（8台分）を確保済み。",
    shootingSpots:
      "浅川の堤防上が最良。市役所の屋上からも河川全景が撮影可能。ドローン使用許可要確認。",
    ipTransmissionInfo:
      "au・docomo・softbankの3キャリアボンディングで安定。伝送速度良好。山間部のため、通信塔の見通し確保必須。",
    fpuInfo:
      "八王子中継局への見通しあり。ただし上流部はビル影になる可能性あり。事前に信号テスト推奨。",
    hazards:
      "河川増水により足元が不安定。土砂崩れのリスク高い。ロープ・ライフジャケット持参必須。雨具はレインコート推奨（動きやすさ重視）。",
    notes: [
      {
        title: "駐車場について",
        body: "市役所前のパーキングは料金が安い（20分100円）。朝7時から営業。",
      },
      {
        title: "現地到着時の確認事項",
        body: "市役所職員に連絡を取り、最新の水位情報を入手すること。危険箇所の封鎖状況も確認。",
      },
    ],
    checkpoints: [
      {
        time: new Date("2026-08-17T09:15:00").toISOString(),
        lat: 35.66527,
        lng: 139.3314,
        comment: "局発",
      },
      {
        time: new Date("2026-08-17T09:45:00").toISOString(),
        lat: 35.66892,
        lng: 139.32788,
        comment: "現場着",
      },
    ],
    track: [],
    equipmentHeaders: [],
    equipmentRows: [],
    photos: [],
    sitePhotos: [],
    parkingPhotos: [],
    shootingPhotos: [],
    ipTransmissionPhotos: [],
    fpuPhotos: [],
    hazardPhotos: [],
    status: "published",
    publishedAt: Timestamp.fromDate(new Date("2026-08-17T14:30:00")),
    draftSavedAt: Timestamp.fromDate(new Date("2026-08-17T10:00:00")),
    history: [
      {
        editedBy: "田中太郎（技術）",
        editedAt: Timestamp.fromDate(new Date("2026-08-17T14:30:00")),
        changedFields: ["状態を下書きから正式提出に変更"],
      },
    ],
    createdAt: Timestamp.fromDate(new Date("2026-08-17T09:15:00")),
  },

  {
    // データ2: 渋谷スクランブル交差点・イベント取材（記者）
    organizationId: TEST_ORG_ID,
    category: "記者",
    recordedBy: "鈴木花子（記者）",
    locationName: "渋谷スクランブル交差点",
    address: "東京都渋谷区道玄坂2丁目",
    lat: 35.65949,
    lng: 139.70413,
    incidentType: "渋谷スクランブル交差点・新店舗オープンイベント取材",
    siteInfo:
      "大型商業施設のグランドオープン。連日、夕方から深夜にかけて混雑度ピーク。交差点全体が取材対象。",
    parkingInfo:
      "周辺に駐車場多数。宮下公園駐車場（20台分・750円/30分）が最寄り。道玄坂の民間パーキング（満車率高い）は避ける。",
    shootingSpots:
      "スクランブル交差点の北西角（松本清向かい）から見下ろすのが最良。警察に許可取得済み。夜間は照明が明るく撮影に適している。",
    ipTransmissionInfo:
      "NTT docomo の回線が強い。au は弱い傾向。ボンディング推奨（3キャリア以上）。夜間のピーク時は通信混雑の可能性あり。",
    fpuInfo:
      "渋谷中継局への見通し良好。ただし、周囲の高層ビルが電波反射を引き起こす可能性。事前テスト必須。",
    hazards:
      "交差点での雑踏事故リスクが高い。歩行者との衝突に注意。機材の盗難防止に要注意。防犯カメラの位置を事前確認。",
    notes: [
      {
        title: "撮影時間帯",
        body: "ゴールデンタイムは17:00-20:00。この時間帯の雑踏数がピーク。安全対策を万全に。",
      },
      {
        title: "警察への届け出",
        body: "渋谷警察署に事前に撮影の旨を連絡。許可書の持参を忘れずに。",
      },
    ],
    checkpoints: [
      {
        time: new Date("2026-08-16T15:00:00").toISOString(),
        lat: 35.65949,
        lng: 139.70413,
        comment: "局発",
      },
      {
        time: new Date("2026-08-16T16:30:00").toISOString(),
        lat: 35.65949,
        lng: 139.70413,
        comment: "現場着",
      },
    ],
    track: [],
    equipmentHeaders: [],
    equipmentRows: [],
    photos: [],
    sitePhotos: [],
    parkingPhotos: [],
    shootingPhotos: [],
    ipTransmissionPhotos: [],
    fpuPhotos: [],
    hazardPhotos: [],
    status: "published",
    publishedAt: Timestamp.fromDate(new Date("2026-08-16T21:00:00")),
    draftSavedAt: Timestamp.fromDate(new Date("2026-08-16T18:00:00")),
    history: [
      {
        editedBy: "鈴木花子（記者）",
        editedAt: Timestamp.fromDate(new Date("2026-08-16T21:00:00")),
        changedFields: ["イベント取材完了し正式提出"],
      },
    ],
    createdAt: Timestamp.fromDate(new Date("2026-08-16T15:00:00")),
  },

  {
    // データ3: 奥多摩町・山岳捜索取材（カメラマン）
    organizationId: TEST_ORG_ID,
    category: "カメラマン",
    recordedBy: "山田次郎（カメラマン）",
    locationName: "奥多摩町・釈迦ヶ岳登山口",
    address: "東京都西多摩郡奥多摩町梅沢",
    lat: 35.79062,
    lng: 139.27779,
    incidentType: "山岳捜索・行方不明者捜索取材（遭難ドキュメント）",
    siteInfo:
      "登山口から尾根沿いに約1時間半の場所で遭難。捜索隊は複数チームに分かれて活動中。現場の地形は急斜面で危険性高い。",
    parkingInfo:
      "登山口の駐車スペース（10台程度）に停車。朝6時の時点で満車。奥多摩湖畔の二次駐車場（20分歩き）も利用可。",
    shootingSpots:
      "登山口からの眺望が良い。山頂付近からのドローン撮影で全体像を把握可能。ただし電波環境が悪いため、通信確保が重要。",
    ipTransmissionInfo:
      "奥多摩町中心部は NTT docomo のLTE が入るが、山頂付近では電波が弱い。中継地点での中継機活用が必須。衛星電話の持参を推奨。",
    fpuInfo:
      "奥多摩中継局への見通しはあるが、山間部のため反射・減衰が大きい。事前の信号確認が重要。FPU電源の持続時間に注意（長時間稼働想定）。",
    hazards:
      "山岳地帯での転落・滑落リスクが極めて高い。急勾配の箇所が複数。ロープ・ハーネス等の安全具は必須。登山経験者のみ現場入場。",
    notes: [
      {
        title: "山岳安全対策",
        body: "登山用のヘルメット・ロープ・滑落防止具を装備。天気予報を毎時確認。雷の可能性があれば撤退すること。",
      },
      {
        title: "通信確保",
        body: "衛星電話またはIP衛星通信を用意。奥多摩は電波が極めて悪い。バッテリー予備電を複数個持参。",
      },
    ],
    checkpoints: [
      {
        time: new Date("2026-08-15T06:30:00").toISOString(),
        lat: 35.79062,
        lng: 139.27779,
        comment: "局発（早朝出発）",
      },
      {
        time: new Date("2026-08-15T08:00:00").toISOString(),
        lat: 35.79545,
        lng: 139.27456,
        comment: "登山口到着",
      },
    ],
    track: [],
    equipmentHeaders: [],
    equipmentRows: [],
    photos: [],
    sitePhotos: [],
    parkingPhotos: [],
    shootingPhotos: [],
    ipTransmissionPhotos: [],
    fpuPhotos: [],
    hazardPhotos: [],
    status: "published",
    publishedAt: Timestamp.fromDate(new Date("2026-08-15T18:00:00")),
    draftSavedAt: Timestamp.fromDate(new Date("2026-08-15T12:00:00")),
    history: [
      {
        editedBy: "山田次郎（カメラマン）",
        editedAt: Timestamp.fromDate(new Date("2026-08-15T18:00:00")),
        changedFields: ["撮影完了し正式提出"],
      },
    ],
    createdAt: Timestamp.fromDate(new Date("2026-08-15T06:30:00")),
  },

  {
    // データ4: 横浜港・船舶事故対応（ディレクター）
    organizationId: TEST_ORG_ID,
    category: "ディレクター",
    recordedBy: "佐藤三郎（ディレクター）",
    locationName: "横浜港・大さん橋国際客船ターミナル",
    address: "神奈川県横浜市中区海岸通1丁目1番4号",
    lat: 35.4437,
    lng: 139.6452,
    incidentType: "横浜港・船舶事故（衝突事故）の取材・コーディネート",
    siteInfo:
      "大さん橋に接岸中の客船が防波堤に衝突。負傷者なし。横浜海上保安部が現場対応中。取材許可範囲は限定的。",
    parkingInfo:
      "大さん橋の駐車場は取材者向けに一部解放（4台分確保済み）。通常の観光客駐車場（800円/時間）も利用可。",
    shootingSpots:
      "大さん橋の展望台から全景撮影が最良。ただし、海上保安部の規制区域に注意。水上からの撮影は許可取得時のみ可能。",
    ipTransmissionInfo:
      "横浜港周辺は3キャリア全て良好。港湾施設の屋上からの中継も可能。NTT の回線が最も安定。",
    fpuInfo:
      "横浜中継局への見通し非常に良好。港湾の高さを活かした伝送が期待できる。バックアップ回線も確保推奨。",
    hazards:
      "港湾での強風リスク。機材の転倒・落下防止に要注意。海辺のため塩害による機材腐食も懸念。防水・防塵対策を万全に。",
    notes: [
      {
        title: "海上保安部との調整",
        body: "事前に横浜海上保安部に取材申請。撮影範囲・時間の確認は必須。",
      },
      {
        title: "天気予報",
        body: "港湾部の強風に注意。台風シーズン（8月中旬）は特に注意が必要。",
      },
    ],
    checkpoints: [
      {
        time: new Date("2026-08-14T14:00:00").toISOString(),
        lat: 35.4437,
        lng: 139.6452,
        comment: "局発",
      },
      {
        time: new Date("2026-08-14T15:15:00").toISOString(),
        lat: 35.4437,
        lng: 139.6452,
        comment: "現場着",
      },
    ],
    track: [],
    equipmentHeaders: [],
    equipmentRows: [],
    photos: [],
    sitePhotos: [],
    parkingPhotos: [],
    shootingPhotos: [],
    ipTransmissionPhotos: [],
    fpuPhotos: [],
    hazardPhotos: [],
    status: "published",
    publishedAt: Timestamp.fromDate(new Date("2026-08-14T19:30:00")),
    draftSavedAt: Timestamp.fromDate(new Date("2026-08-14T16:00:00")),
    history: [
      {
        editedBy: "佐藤三郎（ディレクター）",
        editedAt: Timestamp.fromDate(new Date("2026-08-14T19:30:00")),
        changedFields: ["コーディネート完了し正式提出"],
      },
    ],
    createdAt: Timestamp.fromDate(new Date("2026-08-14T14:00:00")),
  },
];

async function main() {
  loadEnvLocal();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    console.error("FIREBASE_PROJECT_ID が設定されていません");
    process.exit(1);
  }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey,
  };

  if (!privateKey) {
    console.error(
      ".env.local に FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY を設定してください"
    );
    process.exit(1);
  }

  initializeApp({
    credential: cert(serviceAccount),
  });

  const db = getFirestore();

  console.log("🚀 Firestore へのダミー出動記録挿入を開始します...\n");

  for (const [index, record] of DUMMY_RECORDS.entries()) {
    try {
      // コレクションに追加
      const docRef = await db.collection("dispatch_records").add(record);

      console.log(
        `✅ データ ${index + 1}: "${record.locationName}" (${record.category}) を挿入しました`
      );
      console.log(`   ドキュメントID: ${docRef.id}\n`);
    } catch (error) {
      console.error(
        `❌ データ ${index + 1}: "${record.locationName}" の挿入に失敗しました`
      );
      console.error(`   エラー: ${error.message}\n`);
    }
  }

  console.log("✨ ダミーデータ挿入が完了しました！");
  console.log("📋 以下のコマンドで確認できます:");
  console.log("   ブラウザで http://localhost:3000/dispatch を開く");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
