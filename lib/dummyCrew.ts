// 報道クルー/スタッフの位置情報 ダミーデータ
// TODO: 実データ連携(Firestore等)が決まり次第、本モジュールは置き換える想定。

export type CrewStatus = "現場対応中" | "移動中" | "待機中" | "帰社中";

// 滞在ポイント: 移動履歴の途中で一定時間とどまった場所
export type StayPoint = {
  name: string;
  lat: number;
  lng: number;
  arrivedAt: string; // "HH:MM"
  departedAt: string; // "HH:MM"
  duration: string; // 表示用ラベル(例: "1時間30分")
};

// GPS移動履歴: 過去数時間分の座標軌跡 + 途中の滞在ポイント
export type LocationHistory = {
  path: [number, number][]; // [latitude, longitude] の時系列配列
  stayPoints: StayPoint[];
};

export type CrewMember = {
  id: string;
  name: string;
  role: string;
  status: CrewStatus;
  vehicle: string;
  phone: string;
  updatedAt: string;
  position: [number, number]; // [latitude, longitude]
  locationHistory?: LocationHistory;
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
    locationHistory: {
      path: [
        [35.658034, 139.701636], // 渋谷
        [35.665, 139.71],
        [35.6712, 139.7245],
        [35.6762, 139.7407], // 赤坂見附付近
        [35.6785, 139.7532],
        [35.6803, 139.7605], // 有楽町付近
        [35.681236, 139.767125], // 東京駅
      ],
      stayPoints: [
        {
          name: "渋谷スクランブル交差点",
          lat: 35.658034,
          lng: 139.701636,
          arrivedAt: "09:00",
          departedAt: "10:20",
          duration: "1時間20分",
        },
        {
          name: "赤坂見附 現場",
          lat: 35.6762,
          lng: 139.7407,
          arrivedAt: "10:45",
          departedAt: "12:10",
          duration: "1時間25分",
        },
        {
          name: "東京駅前 中継地点",
          lat: 35.681236,
          lng: 139.767125,
          arrivedAt: "12:40",
          departedAt: "現在",
          duration: "対応中",
        },
      ],
    },
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
    locationHistory: {
      path: [
        [35.671989, 139.764054], // 大手町
        [35.678, 139.745],
        [35.684, 139.723],
        [35.690921, 139.700258], // 新宿
      ],
      stayPoints: [
        {
          name: "大手町 局舎",
          lat: 35.671989,
          lng: 139.764054,
          arrivedAt: "08:30",
          departedAt: "10:00",
          duration: "1時間30分",
        },
        {
          name: "新宿駅前 取材現場",
          lat: 35.690921,
          lng: 139.700258,
          arrivedAt: "10:35",
          departedAt: "現在",
          duration: "対応中",
        },
      ],
    },
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
    locationHistory: {
      path: [
        [35.646358, 139.710388], // 恵比寿
        [35.6515, 139.706],
        [35.658034, 139.701636], // 渋谷
      ],
      stayPoints: [
        {
          name: "恵比寿ガーデンプレイス",
          lat: 35.646358,
          lng: 139.710388,
          arrivedAt: "11:00",
          departedAt: "12:15",
          duration: "1時間15分",
        },
      ],
    },
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
    locationHistory: {
      path: [
        [35.660494, 139.729479], // 六本木
        [35.6672, 139.733],
        [35.673568, 139.736409], // 赤坂
      ],
      stayPoints: [
        {
          name: "六本木ヒルズ前",
          lat: 35.660494,
          lng: 139.729479,
          arrivedAt: "09:20",
          departedAt: "11:00",
          duration: "1時間40分",
        },
        {
          name: "赤坂 待機場所",
          lat: 35.673568,
          lng: 139.736409,
          arrivedAt: "11:20",
          departedAt: "現在",
          duration: "待機中",
        },
      ],
    },
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
    locationHistory: {
      path: [
        [35.625957, 139.774301], // 台場
        [35.64, 139.75],
        [35.660494, 139.729479], // 六本木
      ],
      stayPoints: [
        {
          name: "お台場 撮影ポイント",
          lat: 35.625957,
          lng: 139.774301,
          arrivedAt: "08:00",
          departedAt: "09:45",
          duration: "1時間45分",
        },
      ],
    },
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
    locationHistory: {
      path: [
        [35.666379, 139.758421], // 新橋
        [35.645, 139.766],
        [35.625957, 139.774301], // 台場
      ],
      stayPoints: [
        {
          name: "新橋 現場",
          lat: 35.666379,
          lng: 139.758421,
          arrivedAt: "09:10",
          departedAt: "13:30",
          duration: "4時間20分",
        },
        {
          name: "台場 局舎(帰社)",
          lat: 35.625957,
          lng: 139.774301,
          arrivedAt: "13:55",
          departedAt: "現在",
          duration: "帰社中",
        },
      ],
    },
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
    locationHistory: {
      path: [
        [35.671989, 139.764054], // 大手町
        [35.669, 139.761],
        [35.666379, 139.758421], // 新橋
      ],
      stayPoints: [
        {
          name: "大手町 中継準備",
          lat: 35.671989,
          lng: 139.764054,
          arrivedAt: "10:00",
          departedAt: "11:30",
          duration: "1時間30分",
        },
        {
          name: "新橋 中継現場",
          lat: 35.666379,
          lng: 139.758421,
          arrivedAt: "11:50",
          departedAt: "現在",
          duration: "対応中",
        },
      ],
    },
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
    locationHistory: {
      path: [
        [35.681236, 139.767125], // 東京駅
        [35.676, 139.7655],
        [35.671989, 139.764054], // 大手町
      ],
      stayPoints: [
        {
          name: "東京駅 中継地点",
          lat: 35.681236,
          lng: 139.767125,
          arrivedAt: "08:45",
          departedAt: "10:10",
          duration: "1時間25分",
        },
      ],
    },
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
    locationHistory: {
      path: [
        [35.690921, 139.700258], // 新宿
        [35.693, 139.709],
        [35.696043, 139.716836], // 新宿御苑周辺
      ],
      stayPoints: [
        {
          name: "新宿駅 集合場所",
          lat: 35.690921,
          lng: 139.700258,
          arrivedAt: "09:30",
          departedAt: "10:50",
          duration: "1時間20分",
        },
      ],
    },
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
    locationHistory: {
      path: [
        [35.658034, 139.701636], // 渋谷
        [35.652, 139.706],
        [35.646358, 139.710388], // 恵比寿
      ],
      stayPoints: [
        {
          name: "渋谷 取材現場",
          lat: 35.658034,
          lng: 139.701636,
          arrivedAt: "08:15",
          departedAt: "11:00",
          duration: "2時間45分",
        },
        {
          name: "恵比寿 現場",
          lat: 35.646358,
          lng: 139.710388,
          arrivedAt: "11:25",
          departedAt: "現在",
          duration: "対応中",
        },
      ],
    },
  },
];
