// 東京エリアを中心とする現場ダミーデータ(10件)を pins コレクションへ投入するスクリプト。
// scripts/seed-outdoor-pins.mjs と同じ拡張済みPin型(referenceId/drawings/customFields)に
// 対応した内容で作成する。
//
// 使い方:
//   node scripts/seed-tokyo-pins.mjs
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

// 確認用管理者(admin@spotbase.local)のorganizationId。他のseedスクリプトと同じ値。
const TEST_ORG_ID = "jPvFyIZWT6fhpDqfZDaOGQ8IZpq2";

function drawing(fileName, daysAgo, uploadedBy = "システム管理者") {
  const uploadedAt = Timestamp.fromDate(
    new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
  );
  return {
    id: `dummy-${fileName}`,
    url: `https://example.com/dummy-drawings/${encodeURIComponent(fileName)}`,
    fileName,
    uploadedAt,
    uploadedBy,
    isLatest: false,
  };
}

function withLatestFlag(drawings) {
  if (drawings.length === 0) return drawings;
  const latest = drawings.reduce((a, b) =>
    b.uploadedAt.toMillis() > a.uploadedAt.toMillis() ? b : a
  );
  return drawings.map((d) => ({ ...d, isLatest: d.id === latest.id }));
}

const DUMMY_TOKYO_PINS = [
  {
    name: "渋谷スクランブル交差点付近 ルーフトップ",
    referenceId: "LOC-2026-0201",
    address: "東京都渋谷区道玄坂2-2-1",
    lat: 35.6595,
    lng: 139.7005,
    photoSeed: "shibuya-rooftop",
    hazards: "電源あり、防音対策必須。渋谷駅前を俯瞰撮影できるビル屋上のため、強風時の機材固定に注意。",
    drawings: withLatestFlag([drawing("渋谷ルーフトップ_撮影配置図_2026.pdf", 4)]),
    customFields: [
      { key: "搬入・駐車場", value: "ビル地下の荷捌き用駐車場より業務用エレベーターで搬入可(要事前予約)。" },
      { key: "通信・電波", value: "渋谷駅前のため全キャリア5G良好。屋上でも安定して配信可能。" },
      { key: "電源・設備", value: "屋上に200V動力電源あり(要ブレーカー容量確認)。防音パネルの持ち込み推奨。" },
      { key: "周辺環境", value: "近隣にコンビニ・飲食店多数。人通りが多いため機材搬入時間は早朝が無難。" },
    ],
  },
  {
    name: "新宿高層ビル街 ナイトロケポイント",
    referenceId: "LOC-2026-0202",
    address: "東京都新宿区西新宿2-8-1",
    lat: 35.6896,
    lng: 139.6921,
    photoSeed: "shinjuku-night",
    hazards: "夜間ライトアップ背景。三脚設置制限あり、道路使用許可要。夜間撮影のため足元照明を別途用意すること。",
    drawings: withLatestFlag([
      drawing("新宿ナイトロケ_カメラ位置図.pdf", 6),
      drawing("新宿ナイトロケ_下見メモ_2025.pdf", 250),
    ]),
    customFields: [
      { key: "搬入・駐車場", value: "西新宿の時間貸駐車場を利用。深夜割引時間帯を狙うと料金を抑えられる。" },
      { key: "通信・電波", value: "高層ビル群のため場所によって電波の乱反射あり。事前に信号強度テスト推奨。" },
      { key: "電源・設備", value: "路上に商用電源なし。ポータブルバッテリー必須。照明機材は台数制限に注意。" },
      { key: "周辺環境", value: "所轄警察署への道路使用許可申請が必要(申請目安1週間前)。" },
    ],
  },
  {
    name: "銀座 昭和通り沿いレトロオフィスビル",
    referenceId: "LOC-2026-0203",
    address: "東京都中央区銀座4-10-1",
    lat: 35.6712,
    lng: 139.7671,
    photoSeed: "ginza-retro-building",
    hazards: "エレベーター搬入制限あり(重量・サイズとも要事前確認)。昭和レトロな地下階段は照度が低く足元注意。",
    drawings: withLatestFlag([drawing("銀座レトロビル_搬入経路図.pdf", 10)]),
    customFields: [
      { key: "搬入・駐車場", value: "ビル裏手に荷捌きスペースあり。大型車は近隣コインパーキングへ回送。" },
      { key: "通信・電波", value: "地下階段部分は電波が弱いため、配信時は中継アンテナの延長を検討。" },
      { key: "電源・設備", value: "各階に100V電源あり。地下エントランス照明は既存設備が古いため持ち込み推奨。" },
      { key: "周辺環境", value: "オフィスビルのため平日日中はテナント通行あり。休日ロケが望ましい。" },
    ],
  },
  {
    name: "浅草 雷門周辺＆隅田川テラス",
    referenceId: "LOC-2026-0204",
    address: "東京都台東区浅草2-3-1",
    lat: 35.7111,
    lng: 139.7964,
    photoSeed: "asakusa-kaminarimon",
    hazards: "観光地ロケのため早朝(6時〜8時)推奨。日中は観光客が非常に多く、通行妨げにならない配慮が必要。",
    drawings: withLatestFlag([drawing("浅草雷門_早朝ロケ動線図.pdf", 8)]),
    customFields: [
      { key: "搬入・駐車場", value: "雷門周辺は車両進入規制あり。隅田川沿いの時間貸駐車場から台車搬入。" },
      { key: "通信・電波", value: "観光客のスマホ利用が集中する時間帯は回線混雑。早朝は良好。" },
      { key: "電源・設備", value: "公共の電源設備なし。バッテリー式照明・音響機材を推奨。" },
      { key: "周辺環境", value: "控室は近隣和風レンタルスペースを手配するのが定番(要事前予約)。" },
    ],
  },
  {
    name: "築地 旧市場周辺 倉庫＆路地裏",
    referenceId: "LOC-2026-0205",
    address: "東京都中央区築地4-14-1",
    lat: 35.6655,
    lng: 139.7706,
    photoSeed: "tsukiji-warehouse",
    hazards: "独特の雰囲気を持つ路地裏・倉庫跡のため足場が悪い箇所あり。夜間は照明不足で移動時要注意。",
    drawings: withLatestFlag([drawing("築地路地裏_撮影可能エリア図.pdf", 15)]),
    customFields: [
      { key: "搬入・駐車場", value: "路地が狭く大型車両は進入不可。軽トラ+台車での小分け搬入が現実的。" },
      { key: "通信・電波", value: "倉庫内は電波が弱まるため、屋外アンテナ設置または中継が必要な場合あり。" },
      { key: "電源・設備", value: "倉庫によっては電源が使えない場合あり、事前に所有者へ確認要。" },
      { key: "周辺環境", value: "近隣飲食店でのロケ弁手配が容易。差し入れ・打ち上げにも便利。" },
    ],
  },
  {
    name: "天王洲アイル 運河沿いボードウォーク",
    referenceId: "LOC-2026-0206",
    address: "東京都品川区東品川2-2-20",
    lat: 35.6214,
    lng: 139.7501,
    photoSeed: "tennozu-canal",
    hazards: "商業施設協議が必要。ウォーターフロントのため強風・水辺の足元に注意。",
    drawings: withLatestFlag([
      drawing("天王洲ボードウォーク_配置図_2026.pdf", 1),
      drawing("天王洲ボードウォーク_旧配置図_2024.pdf", 500),
    ]),
    customFields: [
      { key: "搬入・駐車場", value: "商業施設付属の駐車場を利用可能(要事前申請・時間指定あり)。" },
      { key: "通信・電波", value: "通信環境極めて良好。各社5G/Wi-Fiとも安定、生配信の実績多数。" },
      { key: "電源・設備", value: "ボードウォーク沿いに屋外コンセントあり(施設管理者の許可要)。" },
      { key: "周辺環境", value: "モダンなウォーターフロントで背景映え良好。商業施設内にカフェ・控室候補あり。" },
    ],
  },
  {
    name: "上野恩賜公園 不忍池周辺エリア",
    referenceId: "LOC-2026-0207",
    address: "東京都台東区上野公園5-20",
    lat: 35.7121,
    lng: 139.7712,
    photoSeed: "ueno-shinobazu-pond",
    hazards: "東京都公園協会への事前許可が必要。機材台車移動必須(車両乗り入れ不可エリアあり)。",
    drawings: withLatestFlag([drawing("上野不忍池_許可申請添付図.pdf", 20)]),
    customFields: [
      { key: "搬入・駐車場", value: "公園内車両乗り入れ不可。周辺コインパーキングから台車での搬入となる。" },
      { key: "通信・電波", value: "公園内は開けており電波良好。木陰の多いエリアはやや弱まる場合あり。" },
      { key: "電源・設備", value: "公園内の電源設備は限定的。事前に公園管理事務所へ利用可否を確認。" },
      { key: "周辺環境", value: "自然景観・水辺が魅力。イベント時期は混雑するため事前確認が望ましい。" },
    ],
  },
  {
    name: "秋葉原 電気街口前 広場＆高架下",
    referenceId: "LOC-2026-0208",
    address: "東京都千代田区外神田1-15-18",
    lat: 35.6983,
    lng: 139.7731,
    photoSeed: "akihabara-electric-town",
    hazards: "人通り超過密につき深夜・早朝限定でのロケが望ましい。街頭ロケのため通行人への配慮を徹底。",
    drawings: withLatestFlag([drawing("秋葉原電気街口_深夜ロケ動線図.pdf", 7)]),
    customFields: [
      { key: "搬入・駐車場", value: "深夜のみ広場付近での一時停車・荷下ろし可能。日中は近隣パーキングへ回送。" },
      { key: "通信・電波", value: "サイバー・街頭ロケに適した環境で全キャリア良好。深夜は特に安定。" },
      { key: "電源・設備", value: "高架下に一部電源設備あり(管理者確認要)。それ以外はポータブル電源推奨。" },
      { key: "周辺環境", value: "コンビニ・飲食店が24時間営業で多数。深夜ロケでも困らない立地。" },
    ],
  },
  {
    name: "豊洲 湾岸エリア 大型オープンスタジオ",
    referenceId: "LOC-2026-0209",
    address: "東京都江東区豊洲6-1-1",
    lat: 35.6461,
    lng: 139.7885,
    photoSeed: "toyosu-open-studio",
    hazards: "大型トラック直接横付け可のため搬入自体は容易。屋外スタジオのため悪天候時は別途養生要。",
    drawings: withLatestFlag([drawing("豊洲オープンスタジオ_設備配置図.pdf", 3)]),
    customFields: [
      { key: "搬入・駐車場", value: "大型トラック直接横付け可。専用搬入口あり、事前予約で優先利用できる。" },
      { key: "通信・電波", value: "湾岸エリアで開けており各社良好。有線LAN引き込みにも対応可。" },
      { key: "電源・設備", value: "C型電源完備。大容量機材にも対応可能な設備が整っている。" },
      { key: "周辺環境", value: "控室3部屋併設。長時間ロケでも快適に運用できる。" },
    ],
  },
  {
    name: "吉祥寺 井の頭恩賜公園 森林ロケ地",
    referenceId: "LOC-2026-0210",
    address: "東京都武蔵野市御殿山1-18-31",
    lat: 35.6997,
    lng: 139.5732,
    photoSeed: "kichijoji-inokashira-park",
    hazards: "駐車場から現場まで徒歩10分、機材の運搬手段を事前に検討すること。園内は自然地形のため足元注意。",
    drawings: withLatestFlag([drawing("井の頭公園_森林ロケ動線図.pdf", 12)]),
    customFields: [
      { key: "搬入・駐車場", value: "駐車場から現場まで徒歩10分。台車・リヤカーでの機材運搬を推奨。" },
      { key: "通信・電波", value: "都心からアクセス良い自然景観だが、木々が多いエリアは電波がやや弱まる。" },
      { key: "電源・設備", value: "園内に電源設備なし。バッテリー式機材での運用が前提。" },
      { key: "周辺環境", value: "吉祥寺駅周辺に飲食店・控室候補多数。ロケ地までのアクセスも良好。" },
    ],
  },
];

async function seedTokyoPins() {
  loadEnvLocal();

  const app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
  const db = getFirestore(app);

  console.log("🌱 東京エリア 現場ダミーデータ(10件)を投入開始...");

  for (const spot of DUMMY_TOKYO_PINS) {
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
      photoUrls: [
        `https://picsum.photos/seed/${spot.photoSeed}-1/1200/800`,
        `https://picsum.photos/seed/${spot.photoSeed}-2/1200/800`,
      ],
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

  console.log(`\n✨ ${DUMMY_TOKYO_PINS.length}件の東京エリア現場ダミーデータを投入しました`);
  process.exit(0);
}

seedTokyoPins().catch((error) => {
  console.error("❌ 投入中にエラーが発生しました:", error);
  process.exit(1);
});
