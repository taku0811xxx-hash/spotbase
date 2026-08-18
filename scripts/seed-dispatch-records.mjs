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

  {
    // データ5: 東京タワー・通信機材点検（技術）
    organizationId: TEST_ORG_ID,
    category: "技術",
    recordedBy: "山田花子（技術）",
    locationName: "東京タワー周辺",
    address: "東京都港区芝公園4丁目2-8",
    lat: 35.65859,
    lng: 139.74538,
    incidentType: "通信機材の定期点検・保守作業",
    siteInfo:
      "東京タワーの通信機材室で定期メンテナンス実施。複数キャリアの基地局機材を点検。タワー内部の温度・湿度管理を確認。",
    parkingInfo:
      "タワー周辺の民間駐車場を利用。タワー直下のパーキング（高さ制限2.3m）は利用不可。芝公園の周辺に複数パーキング配置。",
    shootingSpots:
      "タワー下部からの撮影が可能。機材室内部は撮影許可要。外部からのタワー全景も参考になる。",
    ipTransmissionInfo:
      "タワー内の複数基地局から安定した伝送が可能。スマートフォンのテザリングでも高速。中継設備に負荷をかけないよう注意。",
    fpuInfo:
      "タワーの放送局施設との連携が可能。機材室からの直接中継も検討。バックアップ回線は別回線で確保推奨。",
    hazards:
      "高所作業のため安全帯・ヘルメット着用必須。機材室内の高電圧機器に注意。メンテナンス時は周囲の人員配置を確認。",
    notes: [
      {
        title: "機材室アクセス",
        body: "セキュリティチェックが厳しい。身分証明書とスタッフ証が必須。事前予約と立ち入り許可確認が重要。",
      },
      {
        title: "メンテナンス時間",
        body: "放送運用に支障がないよう、深夜帯（22:00-6:00）の作業が基本。緊急対応以外は事前スケジュール調整。",
      },
    ],
    checkpoints: [
      {
        time: new Date("2026-08-13T21:00:00").toISOString(),
        lat: 35.65859,
        lng: 139.74538,
        comment: "局発",
      },
      {
        time: new Date("2026-08-13T22:15:00").toISOString(),
        lat: 35.65859,
        lng: 139.74538,
        comment: "現場着・機材室入室",
      },
      {
        time: new Date("2026-08-14T01:30:00").toISOString(),
        lat: 35.65859,
        lng: 139.74538,
        comment: "メンテナンス完了・撤収",
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
    publishedAt: Timestamp.fromDate(new Date("2026-08-14T04:00:00")),
    draftSavedAt: Timestamp.fromDate(new Date("2026-08-14T01:00:00")),
    history: [
      {
        editedBy: "山田花子（技術）",
        editedAt: Timestamp.fromDate(new Date("2026-08-14T04:00:00")),
        changedFields: ["定期点検完了し正式提出"],
      },
    ],
    createdAt: Timestamp.fromDate(new Date("2026-08-13T21:00:00")),
  },

  {
    // データ6: 羽田空港・放送イベント対応（技術）
    organizationId: TEST_ORG_ID,
    category: "技術",
    recordedBy: "佐藤太郎（技術）",
    locationName: "羽田空港第1ターミナル",
    address: "東京都大田区羽田空港3-4-1",
    lat: 35.55263,
    lng: 139.77194,
    incidentType: "空港ターミナルでの放送イベント技術サポート",
    siteInfo:
      "羽田空港第1ターミナルの特別イベント（航空会社セレモニー）にて技術スタッフとして対応。複数放送局との同時配信に対応。",
    parkingInfo:
      "空港公式駐車場（P4・P5）を利用。イベント関係車両用の特別停車エリアあり。搬入・搬出時間は事前調整が必須。",
    shootingSpots:
      "ターミナルロビーからの撮影許可あり。パブリックエリア内での機材設営に配慮。上層階からのドローン撮影は不可。",
    ipTransmissionInfo:
      "羽田空港の高速WiFi利用可。ただしセキュリティが厳しく、事前登録必須。モバイル回線は au・docomo ともに強し。",
    fpuInfo:
      "羽田中継局への見通し良好。ターミナル屋上からの直接中継も可能。小田急・京急線との連携放送も検討。",
    hazards:
      "空港内での撮影許可管理が厳格。セキュリティエリアに注意。搬入・搬出時に一般客との接触リスク。",
    notes: [
      {
        title: "事前許可申請",
        body: "撮影許可・機材搬入は、空港テナント管理部に最低3営業日前の申請が必須。テロ対策によるチェックあり。",
      },
      {
        title: "イベントスケジュール",
        body: "セレモニー本番は10:00-11:30。搬入は08:00-09:30、撤収は11:45-12:30で短時間に集中。",
      },
    ],
    checkpoints: [
      {
        time: new Date("2026-08-12T07:00:00").toISOString(),
        lat: 35.55263,
        lng: 139.77194,
        comment: "局発",
      },
      {
        time: new Date("2026-08-12T08:15:00").toISOString(),
        lat: 35.55263,
        lng: 139.77194,
        comment: "空港到着・搬入開始",
      },
      {
        time: new Date("2026-08-12T12:45:00").toISOString(),
        lat: 35.55263,
        lng: 139.77194,
        comment: "撤収完了・局帰着",
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
    publishedAt: Timestamp.fromDate(new Date("2026-08-12T14:00:00")),
    draftSavedAt: Timestamp.fromDate(new Date("2026-08-12T12:00:00")),
    history: [
      {
        editedBy: "佐藤太郎（技術）",
        editedAt: Timestamp.fromDate(new Date("2026-08-12T14:00:00")),
        changedFields: ["イベント技術対応完了し正式提出"],
      },
    ],
    createdAt: Timestamp.fromDate(new Date("2026-08-12T07:00:00")),
  },

  {
    // データ7: スカイツリー・5G環境測定（技術）
    organizationId: TEST_ORG_ID,
    category: "技術",
    recordedBy: "鈴木次郎（技術）",
    locationName: "東京スカイツリー周辺",
    address: "東京都墨田区押上1丁目1-2",
    lat: 35.71009,
    lng: 139.8107,
    incidentType: "5G通信環境の測定・検証テスト",
    siteInfo:
      "スカイツリー周辺の5G通信環境を実測。複数キャリアの電波強度・速度を測定。ビル街での反射・減衰の影響を分析。",
    parkingInfo:
      "スカイツリータウンの駐車場（30分400円）を利用。イベント時は満車の可能性あり。周辺の商業施設駐車場も検討。",
    shootingSpots:
      "スカイツリー東側の公園からの全景撮影が最良。北側からは浅草寺とのコンボショット可能。空撮は許可要確認。",
    ipTransmissionInfo:
      "3キャリア全て強力。特に NTT docomo の 5G が高速。ただし周辺人口密集のため、ピーク時は混雑の可能性。",
    fpuInfo:
      "スカイツリー放送局への見通し非常に良好。直接中継の最適候補地。バックアップ中継局も複数確保可能。",
    hazards:
      "周辺に観光客が多く、機材盗難リスク。測定機器の破損に注意。突然の天候変化にも対応が必要。",
    notes: [
      {
        title: "測定方法",
        body: "複数地点でのスピードテストを実施。朝・昼・夜間の3時間帯で測定して、時間帯別の特性を把握。",
      },
      {
        title: "観光客への配慮",
        body: "混雑時間帯（10:00-16:00）は計測機材を目立たないようにする。三脚等の設営には周囲への注意が必須。",
      },
    ],
    checkpoints: [
      {
        time: new Date("2026-08-11T08:00:00").toISOString(),
        lat: 35.71009,
        lng: 139.8107,
        comment: "局発",
      },
      {
        time: new Date("2026-08-11T09:15:00").toISOString(),
        lat: 35.71009,
        lng: 139.8107,
        comment: "現場着・測定開始",
      },
      {
        time: new Date("2026-08-11T17:00:00").toISOString(),
        lat: 35.71009,
        lng: 139.8107,
        comment: "測定完了・撤収",
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
    publishedAt: Timestamp.fromDate(new Date("2026-08-11T19:00:00")),
    draftSavedAt: Timestamp.fromDate(new Date("2026-08-11T17:30:00")),
    history: [
      {
        editedBy: "鈴木次郎（技術）",
        editedAt: Timestamp.fromDate(new Date("2026-08-11T19:00:00")),
        changedFields: ["5G環境測定完了し正式提出"],
      },
    ],
    createdAt: Timestamp.fromDate(new Date("2026-08-11T08:00:00")),
  },

  {
    // データ8: 品川駅・光ファイバー工事対応（技術）
    organizationId: TEST_ORG_ID,
    category: "技術",
    recordedBy: "高橋花子（技術）",
    locationName: "品川駅西口周辺",
    address: "東京都港区高輪3丁目26-30",
    lat: 35.62815,
    lng: 139.73896,
    incidentType: "光ファイバー埋設工事のテレビ中継対応",
    siteInfo:
      "品川駅西口周辺での大規模光ファイバー埋設工事。NTT等の通信インフラ工事を放送で中継。工事現場のライブ映像配信。",
    parkingInfo:
      "駅周辺の駐車場は満車の可能性が高い。離れた場所の駐車場を事前確保。搬入・搬出は駅前のロータリーを活用。",
    shootingSpots:
      "工事現場の周辺柵からの撮影が最良。ビルの上層階からの全景撮影も可能。駅の歩道橋からも俯瞰ショット可能。",
    ipTransmissionInfo:
      "駅周辺は3キャリア全て良好。駅施設の WiFi も利用可。工事現場内での通信環境も確認して、移動局の設営位置を決定。",
    fpuInfo:
      "品川駅前のビル群からの中継が複数可能。バックアップ中継局も容易に確保できる。高層階からのFPUも検討。",
    hazards:
      "工事現場の機械・重機に注意。掘削作業の進行状況を常に確認。夜間工事の場合は照明・交通管制に配慮。",
    notes: [
      {
        title: "工事スケジュール",
        body: "掘削作業は04:00-10:00の深夜帯。通行人が少ない時間帯での撮影が最適。本線通行止め時間を事前把握。",
      },
      {
        title: "安全管理",
        body: "現場管理者との連携が必須。ヘルメット・安全ベスト着用。工事車両の動きに常に注意。",
      },
    ],
    checkpoints: [
      {
        time: new Date("2026-08-10T03:00:00").toISOString(),
        lat: 35.62815,
        lng: 139.73896,
        comment: "局発（深夜出発）",
      },
      {
        time: new Date("2026-08-10T04:15:00").toISOString(),
        lat: 35.62815,
        lng: 139.73896,
        comment: "現場着・中継開始",
      },
      {
        time: new Date("2026-08-10T10:30:00").toISOString(),
        lat: 35.62815,
        lng: 139.73896,
        comment: "中継終了・撤収",
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
    publishedAt: Timestamp.fromDate(new Date("2026-08-10T12:00:00")),
    draftSavedAt: Timestamp.fromDate(new Date("2026-08-10T10:00:00")),
    history: [
      {
        editedBy: "高橋花子（技術）",
        editedAt: Timestamp.fromDate(new Date("2026-08-10T12:00:00")),
        changedFields: ["光ファイバー工事中継完了し正式提出"],
      },
    ],
    createdAt: Timestamp.fromDate(new Date("2026-08-10T03:00:00")),
  },

  {
    // データ9: 新宿駅・通信品質測定（技術）
    organizationId: TEST_ORG_ID,
    category: "技術",
    recordedBy: "中村三郎（技術）",
    locationName: "新宿駅東口周辺",
    address: "東京都新宿区新宿3丁目38-1",
    lat: 35.52983,
    lng: 139.70028,
    incidentType: "地下鉄・鉄道駅の通信品質測定・改善対応",
    siteInfo:
      "新宿駅東口・地下街での通信環境測定。地下での電波の減衰・反射を分析。複数キャリア・複数周波数帯での実測調査。",
    parkingInfo:
      "新宿駅周辺の駐車場は常時満車。大手町や丸の内の駐車場を利用して、電車で移動する方が効率的。",
    shootingSpots:
      "駅東口からの全景撮影。丸の内線への乗り換え通路からの撮影も可能。地下1階～地下4階のレベル別撮影が必要。",
    ipTransmissionInfo:
      "地下での通信は全体的に不安定。地上レベルに比べて速度が低下。複数回線のボンディング必須。",
    fpuInfo:
      "新宿中継局への見通しは限定的。地上での設営位置が重要。ビルの上層階からの中継が最適。",
    hazards:
      "駅構内での撮影許可管理が厳格。JR・小田急・地下鉄各社の許可が必要。朝夜の通勤ラッシュを避けた測定時間帯の選定が必須。",
    notes: [
      {
        title: "測定時間帯",
        body: "ラッシュ時間帯（7:30-9:30、17:00-19:00）を避ける。昼間（11:00-15:00）の測定が最適。",
      },
      {
        title: "駅構内での撮影許可",
        body: "各鉄道会社に個別申請。商用撮影なので料金発生の可能性あり。事前に使用目的を詳細に説明。",
      },
    ],
    checkpoints: [
      {
        time: new Date("2026-08-09T10:00:00").toISOString(),
        lat: 35.52983,
        lng: 139.70028,
        comment: "局発",
      },
      {
        time: new Date("2026-08-09T11:00:00").toISOString(),
        lat: 35.52983,
        lng: 139.70028,
        comment: "地上測定開始",
      },
      {
        time: new Date("2026-08-09T13:15:00").toISOString(),
        lat: 35.52983,
        lng: 139.70028,
        comment: "地下測定開始",
      },
      {
        time: new Date("2026-08-09T16:00:00").toISOString(),
        lat: 35.52983,
        lng: 139.70028,
        comment: "測定完了・撤収",
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
    publishedAt: Timestamp.fromDate(new Date("2026-08-09T17:30:00")),
    draftSavedAt: Timestamp.fromDate(new Date("2026-08-09T16:30:00")),
    history: [
      {
        editedBy: "中村三郎（技術）",
        editedAt: Timestamp.fromDate(new Date("2026-08-09T17:30:00")),
        changedFields: ["通信品質測定完了し正式提出"],
      },
    ],
    createdAt: Timestamp.fromDate(new Date("2026-08-09T10:00:00")),
  },
];

// Claude API を呼び出して現場情報（pin）を生成
async function generatePinSummary(locationName, address, records) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("⚠️  ANTHROPIC_API_KEYが設定されていません。pins の生成をスキップします。");
    return null;
  }

  const recordsText = records
    .map(
      (r, i) => `
【出動記録 ${i + 1}】(${r.date || "日付不明"}${r.incidentType ? ` / ${r.incidentType}` : ""})
駐車場所: ${r.parkingInfo || "(記載なし)"}
撮影ポイント: ${r.shootingSpots || "(記載なし)"}
携帯回線(IP伝送): ${r.ipTransmissionInfo || "(記載なし)"}
FPU伝送: ${r.fpuInfo || "(記載なし)"}
危険箇所・注意事項: ${r.hazards || "(記載なし)"}`
    )
    .join("\n");

  const prompt = `あなたは放送・映像取材のロケハン情報を整理するベテランカメラマンです。
以下は「${locationName}」(${address})という現場について、${records.length}回分の出動記録から集めた情報です。

${recordsText}

これらを統合して、この現場について今後この場所へ行く人に向けた「現場記録」としてまとめてください。
複数回の記録に共通する情報は1つにまとめ、矛盾する情報があれば時系列が新しい方を優先してください。

以下のJSON形式のみで出力してください。前置きや説明文は一切不要です。
{
  "parkingInfo": "駐車場所についてのまとめ",
  "shootingSpots": "撮影ポイントについてのまとめ",
  "ipTransmissionInfo": "携帯回線(IP伝送)の状況についてのまとめ",
  "fpuInfo": "FPU伝送の状況についてのまとめ",
  "hazards": "危険箇所・注意事項についてのまとめ"
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      console.warn(`⚠️  Claude API エラー (${res.status}): 現場情報の生成をスキップします。`);
      return null;
    }

    const data = await res.json();
    const text = data.content
      ?.map((block) => (block.type === "text" ? block.text : ""))
      .join("") ?? "";

    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn(`⚠️  Claude API 呼び出しエラー: ${err.message}`);
    return null;
  }
}

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

  const insertedRecords = [];

  for (const [index, record] of DUMMY_RECORDS.entries()) {
    try {
      // コレクションに追加
      const docRef = await db.collection("dispatch_records").add(record);

      console.log(
        `✅ データ ${index + 1}: "${record.locationName}" (${record.category}) を挿入しました`
      );
      console.log(`   ドキュメントID: ${docRef.id}\n`);

      // 挿入されたレコード情報を保存（後で pins 生成時に使用）
      insertedRecords.push({
        locationName: record.locationName,
        address: record.address,
        lat: record.lat,
        lng: record.lng,
        organizationId: record.organizationId,
        category: record.category,
        recordedBy: record.recordedBy,
        incidentType: record.incidentType,
        parkingInfo: record.parkingInfo,
        shootingSpots: record.shootingSpots,
        ipTransmissionInfo: record.ipTransmissionInfo,
        fpuInfo: record.fpuInfo,
        hazards: record.hazards,
        createdAt: record.createdAt,
      });
    } catch (error) {
      console.error(
        `❌ データ ${index + 1}: "${record.locationName}" の挿入に失敗しました`
      );
      console.error(`   エラー: ${error.message}\n`);
    }
  }

  console.log("\n📍 現場情報（pins）の生成を開始します...\n");

  // location ごとに重複排除して pins を生成
  const locationMap = new Map();
  for (const record of insertedRecords) {
    const key = `${record.lat},${record.lng}`;
    if (!locationMap.has(key)) {
      locationMap.set(key, {
        locationName: record.locationName,
        address: record.address,
        lat: record.lat,
        lng: record.lng,
        organizationId: record.organizationId,
        category: record.category,
        recordedBy: record.recordedBy,
        records: [],
      });
    }
    locationMap.get(key).records.push({
      date: record.createdAt?.toDate?.()?.toLocaleDateString("ja-JP") ?? "",
      incidentType: record.incidentType,
      parkingInfo: record.parkingInfo,
      shootingSpots: record.shootingSpots,
      ipTransmissionInfo: record.ipTransmissionInfo,
      fpuInfo: record.fpuInfo,
      hazards: record.hazards,
    });
  }

  // 各 location の pins を生成
  for (const [key, location] of locationMap.entries()) {
    const summary = await generatePinSummary(
      location.locationName,
      location.address,
      location.records
    );

    if (!summary) {
      console.log(`⚠️  "${location.locationName}" の現場情報生成をスキップしました`);
      continue;
    }

    try {
      const pinRef = db.collection("pins").doc();
      await pinRef.set({
        name: location.locationName,
        address: location.address,
        lat: location.lat,
        lng: location.lng,
        parkingInfo: summary.parkingInfo ?? "",
        shootingSpots: summary.shootingSpots ?? "",
        ipTransmissionInfo: summary.ipTransmissionInfo ?? "",
        fpuInfo: summary.fpuInfo ?? "",
        hazards: summary.hazards ?? "",
        photoUrls: [],
        shootingPhotoUrls: [],
        hazardPhotoUrls: [],
        organizationId: location.organizationId,
        category: location.category,
        recordedBy: location.recordedBy,
        recordedAt: Timestamp.now(),
      });

      console.log(`✅ 現場情報: "${location.locationName}" (${location.category}) を生成しました`);
      console.log(`   ドキュメントID: ${pinRef.id}\n`);
    } catch (error) {
      console.error(`❌ 現場情報: "${location.locationName}" の生成に失敗しました`);
      console.error(`   エラー: ${error.message}\n`);
    }
  }

  console.log("✨ ダミーデータ挿入と現場情報生成が完了しました！");
  console.log("📋 以下のコマンドで確認できます:");
  console.log("   ブラウザで http://localhost:3000/dispatch を開く");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
