// 報道クルー/スタッフの位置情報 ダミーデータ
// TODO: 実データ連携(Firestore等)が決まり次第、本モジュールは置き換える想定。

export type CrewStatus = "現場対応中" | "移動中" | "待機中" | "帰社中";

export type CrewMember = {
  id: string;
  name: string;
  role: string;
  status: CrewStatus;
  vehicle: string;
  phone: string;
  updatedAt: string;
  position: [number, number]; // [latitude, longitude]
};

export const dummyCrewMembers: CrewMember[] = [
  {
    id: "crew-001",
    name: "佐藤 拓海",
    role: "報道カメラマン",
    status: "現場対応中",
    vehicle: "中継車A",
    phone: "090-1234-5601",
    updatedAt: "たった今",
    position: [35.681236, 139.767125], // 東京駅
  },
  {
    id: "crew-002",
    name: "田中 美咲",
    role: "アナウンサー",
    status: "現場対応中",
    vehicle: "徒歩/電車",
    phone: "090-1234-5602",
    updatedAt: "2分前",
    position: [35.690921, 139.700258], // 新宿
  },
  {
    id: "crew-003",
    name: "鈴木 健太",
    role: "中継技術",
    status: "移動中",
    vehicle: "中継車B",
    phone: "090-1234-5603",
    updatedAt: "5分前",
    position: [35.658034, 139.701636], // 渋谷
  },
  {
    id: "crew-004",
    name: "高橋 優子",
    role: "ディレクター",
    status: "待機中",
    vehicle: "撮影車2号",
    phone: "090-1234-5604",
    updatedAt: "10分前",
    position: [35.673568, 139.736409], // 赤坂
  },
  {
    id: "crew-005",
    name: "伊藤 大輔",
    role: "報道カメラマン",
    status: "移動中",
    vehicle: "撮影車1号",
    phone: "090-1234-5605",
    updatedAt: "3分前",
    position: [35.660494, 139.729479], // 六本木
  },
  {
    id: "crew-006",
    name: "渡辺 さくら",
    role: "デスク",
    status: "帰社中",
    vehicle: "徒歩/電車",
    phone: "090-1234-5606",
    updatedAt: "15分前",
    position: [35.625957, 139.774301], // 台場
  },
  {
    id: "crew-007",
    name: "山本 蓮",
    role: "中継技術",
    status: "現場対応中",
    vehicle: "中継車C",
    phone: "090-1234-5607",
    updatedAt: "1分前",
    position: [35.666379, 139.758421], // 新橋
  },
  {
    id: "crew-008",
    name: "中村 陽菜",
    role: "アナウンサー",
    status: "待機中",
    vehicle: "徒歩/電車",
    phone: "090-1234-5608",
    updatedAt: "8分前",
    position: [35.671989, 139.764054], // 大手町
  },
  {
    id: "crew-009",
    name: "小林 翔太",
    role: "ディレクター",
    status: "移動中",
    vehicle: "撮影車3号",
    phone: "090-1234-5609",
    updatedAt: "4分前",
    position: [35.696043, 139.716836], // 新宿御苑周辺
  },
  {
    id: "crew-010",
    name: "加藤 明日香",
    role: "報道カメラマン",
    status: "現場対応中",
    vehicle: "中継車D",
    phone: "090-1234-5610",
    updatedAt: "たった今",
    position: [35.646358, 139.710388], // 恵比寿
  },
];
