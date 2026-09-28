// 「ここトレ！」(APP_MODE === 'photo')専用のデータ型。
// SpotBase本体のProLocation型(lib/types/proLocation.ts、実体はPin)とは
// フィールドを一切共有しない、完全に独立した型として定義する。
// Firestore上のコレクションも "photo_spots" として分離しており(lib/photoSpots.ts)、
// pro向けの "pins" コレクションとはデータソースのレベルで混ざらない。

export type PhotoSpotTimeOfDay = "早朝" | "昼" | "夕景" | "夜景";

// 被写体・ジャンルタグ(投稿時に複数選択可能)
export const PHOTO_SPOT_SUBJECT_TAGS = ["風景", "都市・建築", "ポートレート", "スナップ", "夜景"] as const;
export type PhotoSpotSubjectTag = (typeof PHOTO_SPOT_SUBJECT_TAGS)[number];

// 機材・撮影条件タグ(絞り込み用。複数選択可能)
export const PHOTO_SPOT_EQUIPMENT_TAGS = ["フルサイズ", "広角", "望遠", "三脚使用可"] as const;
export type PhotoSpotEquipmentTag = (typeof PHOTO_SPOT_EQUIPMENT_TAGS)[number];

// 撮影機材(カメラ・レンズ)
export type PhotoSpotCameraGear = {
  camera?: string; // 例: "SONY α7 IV"
  lens?: string; // 例: "FE 24-70mm F2.8 GM"
};

// 撮影設定(Exif由来、または投稿者が手入力した撮影条件)
export type PhotoSpotExif = {
  fNumber?: number; // 絞り値(F値)
  exposureTime?: string; // シャッタースピード。例: "1/250"
  iso?: number;
  focalLength?: string; // 焦点距離。例: "35mm"
  timeOfDay?: PhotoSpotTimeOfDay; // 撮影時間帯(厳密な時刻ではなくおおまかな区分)
  shotAt?: string; // 撮影日時(ISO文字列。EXIF由来)
};

// 撮影スポット周辺の駐車場情報(コインパーキング・公共駐車場等)
export type PhotoSpotParkingLot = {
  name: string; // 例: "Times 芝公園第2"
  distance: string; // スポットからの徒歩距離。例: "徒歩2分"
  capacity?: string; // 収容台数。例: "12台"
  isCoinParking?: boolean; // コインパーキング(時間貸し)かどうか
  note?: string; // 注意点。例: "高さ制限2.1m", "土日は混雑"
  lat?: number; // 地図上にサブピンを表示する場合の緯度(省略可)
  lng?: number; // 同経度
};

// 写真の利用条件(ライセンス)区分
// free: 無料・商用利用可 / commercial: 商用利用可(クレジット表記等の条件付き) /
// editorial: 非商用・報道等の用途に限る / permission_required: 個別に許可が必要
export type PhotoSpotLicenseType = "free" | "commercial" | "editorial" | "permission_required";

// 写真1枚ごとの個別メタデータ。1回の投稿で複数枚を選んだ場合、各写真は撮影場所・
// 撮影条件が異なりうる(例: 同じ投稿でも別々のスポットで撮った写真をまとめて
// 投稿するケース)ため、PhotoSpotドキュメント直下にこの配列として個別保持する。
export type PhotoSpotPhotoItem = {
  url: string; // 画像URL
  lat: number; // この写真固有の撮影位置(緯度)
  lng: number; // 同経度
  // この写真固有の場所名。施設名・POI名(例: "井の頭恩賜公園")を優先し、
  // 取得できない場合のみ住所にフォールバックする(lib/geocode.tsのPOI優先
  // ジオコーディング参照)。ユーザーが自由に編集できる表示用の主フィールド。
  locationName: string;
  // この写真固有の正式な住所(都道府県〜番地)。locationNameがPOI名の場合に、
  // 裏で保持しておく補足情報。逆引き/検索で取得できた場合のみ設定される。
  address?: string;
  cameraGear?: PhotoSpotCameraGear; // この写真固有の撮影機材
  exif?: PhotoSpotExif; // この写真固有の撮影設定(Exif由来、または手入力)
};

export type PhotoSpot = {
  id: string;
  name: string; // スポット名・おすすめの撮影ポイント
  description?: string; // 説明・構図のコツなど
  // 以下4項目(address/lat/lng/photoUrls)と cameraGear/exif は、投稿の代表値
  // (先頭の写真のデータ)を保持する後方互換フィールド。地図のピン配置・
  // クラスタリング・ギャラリーのサムネイル表示など、投稿単位で1組の位置/
  // 撮影条件しか必要としない既存箇所はこちらを参照する。
  // 写真ごとの個別データが必要な箇所(マイページの撮影アルバム等)は
  // photos配列(lib/photoSpots.ts の getPhotoSpotPhotos)を参照すること。
  address: string;
  lat: number;
  lng: number;
  photoUrls: string[]; // 写真ギャラリー(複数枚。photos[].urlと同じ並び)
  cameraGear?: PhotoSpotCameraGear;
  exif?: PhotoSpotExif;
  // 写真ごとの個別メタデータ(位置情報・場所名・撮影条件)。
  // 旧データ(このフィールドが存在しない投稿)は取得側で後方互換フォールバックする
  // (getPhotoSpotPhotos参照)。
  photos?: PhotoSpotPhotoItem[];
  accessNote?: string; // 撮影時の注意・アドバイス(三脚可否・許可申請・足場等)
  parkingLots?: PhotoSpotParkingLot[]; // 周辺の駐車場・コインパーキング情報
  isFree?: boolean; // 無料で利用・ダウンロード可能か
  allowCommercial?: boolean; // 商用利用可か
  licenseType?: PhotoSpotLicenseType; // 利用条件の区分(表示バッジに使用)
  downloadUrl?: string; // 高解像度/オリジナル画像のダウンロードURL(未設定時はphotoUrlsの表示画像を使う)
  subjectTags?: PhotoSpotSubjectTag[]; // 被写体・ジャンルタグ(絞り込み用)
  equipmentTags?: PhotoSpotEquipmentTag[]; // 機材・撮影条件タグ(絞り込み用)
  // organizationId/categoryはSpotBase本体("pins")向けのダミーデータ・旧seedデータとの
  // 互換のためだけに残した任意項目。「ここトレ！」自体はphoto_users(組織/分類を持たない
  // 独立した会員モデル)による公開共有サービスのため、閲覧範囲の制御には使わない。
  organizationId?: string;
  category?: string;
  postedBy: string; // 投稿者のuid(photo_users)
  postedByName?: string; // 投稿者の表示名(一覧表示用のスナップショット)
  postedAt: string | null; // ISO文字列(Firestore Timestampから変換して保持)
};
