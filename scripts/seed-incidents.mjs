import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// .env.local を手動で読み込む
const envPath = path.resolve(__dirname, "../.env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
envContent.split("\n").forEach((line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return;
  const [key, ...valueParts] = trimmed.split("=");
  const value = valueParts.join("=").replace(/^"/, "").replace(/"$/, "");
  if (key) process.env[key] = value;
});

// Firebase Admin SDK 初期化
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error(
    "Firebase Admin SDK の環境変数が設定されていません: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
  );
  process.exit(1);
}

initializeApp({
  credential: cert({ projectId, clientEmail, privateKey }),
});

const db = getFirestore();

// テスト組織 ID（bootstrap-admin で作成した organizationId）
const TEST_ORG_ID = "jPvFyIZWT6fhpDqfZDaOGQ8IZpq2";

// ダミーデータ
const incidents = [
  {
    title: "渋谷スクランブル交差点付近の多車線事故",
    description:
      "タクシーとトラックが衝突。複数負傷者あり。通行止め実施中。",
    category: "事故",
    locationName: "渋谷スクランブル交差点",
    latitude: 35.6595,
    longitude: 139.7004,
    urgency: "high",
    status: "unverified",
    sourceText:
      "渋谷スクランブル交差点付近でタクシーとトラックが衝突。複数の負傷者が確認されており、警察が対応中です。",
  },
  {
    title: "品川駅周辺での大規模停電",
    description: "駅周辺で停電発生。原因は配電盤のトラブルと推定。復旧中。",
    category: "通信障害",
    locationName: "品川駅南口周辺",
    latitude: 34.6299,
    longitude: 139.7394,
    urgency: "high",
    status: "unverified",
    sourceText:
      "品川駅の南口周辺で大規模な停電が発生。駅周辺の店舗が営業できない状況が続いています。東京電力が原因調査中です。",
  },
  {
    title: "横浜港付近での特殊火災",
    description:
      "倉庫で火災発生。鉄粉が積み重ねられた可能性あり。消防車が出動。",
    category: "火災",
    locationName: "横浜港みなとみらい地区",
    latitude: 35.4437,
    longitude: 139.6380,
    urgency: "high",
    status: "unverified",
    sourceText:
      "横浜港のみなとみらい地区の倉庫で火災が発生。消防車が複数台出動し、現在消火活動が行われています。",
  },
  {
    title: "東京駅丸の内口での爆発予告",
    description: "不審な荷物の報告あり。警察が爆発物処理班を派遣。",
    category: "その他",
    locationName: "東京駅丸の内口",
    latitude: 35.6814,
    longitude: 139.7671,
    urgency: "high",
    status: "unverified",
    sourceText:
      "東京駅の丸の内口付近で不審な荷物が発見されました。警察が到着し、爆発物処理班が対応予定です。",
  },
  {
    title: "新宿駅東口での大規模混雑",
    description: "駅構内が異常混雑。駅員が対応中。原因は調査中。",
    category: "その他",
    locationName: "新宿駅東口",
    latitude: 35.6908,
    longitude: 139.7007,
    urgency: "medium",
    status: "unverified",
    sourceText:
      "新宿駅の東口付近で大規模な混雑が発生しています。駅員が整理に当たっています。",
  },
];

async function seedIncidents() {
  try {
    console.log("速報事案ダミーデータを投入中...");

    const incidentsRef = db.collection("incidents");
    const now = Timestamp.now();

    for (const incident of incidents) {
      await incidentsRef.add({
        ...incident,
        organizationId: TEST_ORG_ID,
        detectedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      console.log(`✓ 投入完了: "${incident.title}"`);
    }

    console.log(`\n✓ ${incidents.length} 件の速報事案を投入しました`);
    process.exit(0);
  } catch (error) {
    console.error("エラーが発生しました:", error);
    process.exit(1);
  }
}

seedIncidents();
