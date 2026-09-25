"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getAllPins,
  searchPins,
  filterPinsByAttributes,
  DEFAULT_PIN_ATTRIBUTE_FILTERS,
  type Pin,
  type PinAttributeFilters,
} from "@/lib/pins";
import PinAttributeFilter from "@/components/PinAttributeFilter";
import { getHighUrgencyIncidents, type Incident } from "@/lib/incidents";
import {
  subscribeActiveFieldNotes,
  createFieldNote,
  resolveFieldNote,
  uploadFieldNoteImages,
  uploadFieldNoteDrawings,
  type FieldNote,
  type FieldNoteCategory,
  type FieldNoteCustomField,
  type FieldNoteDrawing,
} from "@/lib/fieldNotes";
import { getDispatchRecords } from "@/lib/dispatchRecords";
import type { BreakingAlert } from "@/lib/breaking/parseLocation";
import { useBreakingAlerts } from "@/lib/hooks/useBreakingAlerts";
import { useAuth } from "@/components/AuthProvider";
import { logout } from "@/lib/auth";
import { geocodeQuery } from "@/lib/geocode";
import { findWideRoadsNear, findStoppableRoadsNear, type RoadSuggestion } from "@/lib/roads";
import SearchBar from "@/components/SearchBar";
import PinDetail from "@/components/PinDetail";
import SearchLocationPanel from "@/components/SearchLocationPanel";
import Logo from "@/components/Logo";
import HeaderNav from "@/components/HeaderNav";
import PhotoGalleryView from "@/components/PhotoGalleryView";
import PhotoUploadModal from "@/components/PhotoUploadModal";
import { APP_MODE } from "@/lib/config";
import { getAllPhotoSpots } from "@/lib/photoSpots";
import { toDisplayProfile } from "@/lib/photoAuth";
import type { PhotoSpot } from "@/lib/types/photoSpot";
import BottomSheet from "@/components/BottomSheet";
import MobileMenuPortal from "@/components/MobileMenuPortal";
import QuickLocationFilter from "@/components/QuickLocationFilter";
import GroupedPinList from "@/components/GroupedPinList";
import SiteRecordForm from "@/components/SiteRecordForm";
import { type CrewMember, type CrewStatus } from "@/lib/dummyCrew";
import { subscribeCrewLocations } from "@/lib/crewLocations";
import {
  type PathPoint,
  loadPathFromStorage,
  savePathToStorage,
  shouldAppendPoint,
  appendPoint,
  syncPathToFirestore,
  setUserLocationOffline,
  syncDailyLocationHistory,
  distanceMeters,
  intervalMsForSpeedKmh,
} from "@/lib/userPathHistory";

// LeafletはSSR非対応なのでクライアント側のみで読み込む
const Map = dynamic(() => import("@/components/Map"), { ssr: false });

// 位置情報(GPS)の自動取得を起動時に発火させるかどうか。
// falseの間は、ブラウザ/OS標準の「位置情報の利用を許可しますか？」許可ポップアップが
// アプリ起動時・画面遷移時に自動表示されることはない。
// navigator.geolocation呼び出しや位置取得ロジック自体は削除せず保持しており、
// 将来の「ロケクルー位置管理」機能等で再利用する際は、このフラグをtrueに戻すか、
// 明示的なユーザー操作(ボタン押下等)のタイミングで個別に呼び出す形にする想定。
const AUTO_REQUEST_LOCATION_ON_LOAD = false;

type SearchMarker = { lat: number; lng: number; label: string; address: string };

// ピンの parentLocation を取得（フォールバック処理付き）
function getParentLocation(pin: Pin): string {
  if (pin.parentLocation) {
    return pin.parentLocation;
  }

  // parentLocation が空の場合、name から自動抽出
  // スペース区切りの最初の単語を抽出
  const nameParts = pin.name.trim().split(/\s+/);
  if (nameParts.length > 0 && nameParts[0].length > 0) {
    return nameParts[0];
  }

  return "その他";
}

export default function Home() {
  const router = useRouter();
  const { user, profile, photoProfile, loading: authLoading } = useAuth();
  const [pins, setPins] = useState<Pin[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);
  const [searchMarker, setSearchMarker] = useState<SearchMarker | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState("");

  const [selectedPin, setSelectedPin] = useState<Pin | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false); // 詳細パネル開閉状態
  const [roadSuggestions, setRoadSuggestions] = useState<RoadSuggestion[]>([]);
  const [loadingRoads, setLoadingRoads] = useState(false);
  const [stopSuggestions, setStopSuggestions] = useState<RoadSuggestion[]>([]);
  const [loadingStops, setLoadingStops] = useState(false);
  const [hoveredRoadKey, setHoveredRoadKey] = useState<string | null>(null);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  // クライアント側のリアルタイム取得フック（60秒ごとに自動更新）
  const { alerts: breakingAlerts } = useBreakingAlerts();
  // 現場一次情報(通行止め・現場コメント等)。リアルタイム購読でactiveのみ保持し、
  // 「復旧済み」にされた瞬間に地図上から自動的に消える。
  const [fieldNotes, setFieldNotes] = useState<FieldNote[]>([]);
  const [showSiteList, setShowSiteList] = useState(true); // For mobile bottom sheet

  // メニュー開閉状態管理(ハンバーガーメニュー。PC/モバイル共通)
  const [menuOpen, setMenuOpen] = useState(false);

  // ユーザーステータスパネルで切り替える自分自身のステータス
  const [myStatus, setMyStatus] = useState<CrewStatus>("待機中");

  // 現場一覧メニュー(PC画面)の開閉状態。初期状態は閉じた状態にし、
  // 地図はデフォルトで「検索窓＋全面地図」のシンプルな構成にする。
  const [isDispatchListOpen, setIsDispatchListOpen] = useState(false);

  // 「＋現場記録」モーダル(SuperScout風の新規登録フォーム)の開閉・送信状態
  const [showSiteRecordForm, setShowSiteRecordForm] = useState(false);
  const [creatingSiteRecord, setCreatingSiteRecord] = useState(false);

  // 「ここトレ！」(photoモード)専用: スポット投稿モーダルの開閉状態
  const [showPhotoUploadModal, setShowPhotoUploadModal] = useState(false);
  // 「ここトレ！」(photoモード)専用: "photo_spots"コレクションのデータ(pro向けpinsとは別管理)
  const [photoSpots, setPhotoSpots] = useState<PhotoSpot[]>([]);
  const [loadingPhotoSpots, setLoadingPhotoSpots] = useState(true);
  // 「ここトレ！」(photoモード)専用: 地図一覧ページの「詳細を見る」(/?spot=<id>)から
  // 遷移してきた場合、そのスポットを自動選択するためのID。useSearchParams()は
  // Suspense境界が必要になるため、CSRのuseEffectでクエリを直接読み取る。
  const [initialPhotoSpotId, setInitialPhotoSpotId] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (APP_MODE !== "photo" || typeof window === "undefined") return;
    const spotId = new URLSearchParams(window.location.search).get("spot");
    if (spotId) setInitialPhotoSpotId(spotId);
  }, []);
  const [siteRecordError, setSiteRecordError] = useState("");

  // グループ化フィルター選択状態
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<string | null>(null);

  // 属性絞り込み(タグ/図面有無/最終更新日)。フリーワード検索(query)とは別枠。
  const [attributeFilters, setAttributeFilters] = useState<PinAttributeFilters>(
    DEFAULT_PIN_ATTRIBUTE_FILTERS
  );

  // ハイドレーション完了フラグ（Portal用途のみ）
  const [mounted, setMounted] = useState(false);

  // 現在地(GPS)。地図中心とユーザーピンに反映する。
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  // 出動中(ON)/待機中(OFF)のGPS追跡状態。localStorageで再読み込み後も保持する。
  // 初期値はfalse固定(SSR/クライアントのハイドレーション不一致を避けるため)にし、
  // マウント後のuseEffectでlocalStorageの値を反映する。
  const [gpsTracking, setGpsTracking] = useState(false);
  // 「待機中→出動中」切り替え時、位置情報取得が完了するまでの間trueにし、
  // ボタンを「GPS測位中...」表示・連打防止(disabled)にするためのフラグ
  const [gpsAcquiring, setGpsAcquiring] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  // GPS追跡をONにした直後の1回目の位置取得でのみ地図を現在地へ移動させるためのフラグ
  // (以降の継続更新のたびに地図が動いてしまうと操作の邪魔になるため)
  const hasCenteredOnGpsRef = useRef(false);

  // 自分自身の実機GPS移動経路(watchPositionで継続取得した座標を、一定距離
  // 以上移動した場合のみ蓄積)。リロード後も消えないようlocalStorageに永続化し、
  // (可能であれば)Firestoreへも非同期で同期する。詳細は lib/userPathHistory.ts 参照
  const [myPathHistory, setMyPathHistory] = useState<PathPoint[]>([]);
  // Firestoreへの同期頻度を抑えるための直近同期時刻(書き込み過多の防止)
  const lastFirestoreSyncAtRef = useRef(0);
  // GPS記録・送信間隔は移動速度に応じて動的に切り替える(停止中30秒〜1分/
  // 徒歩10〜15秒/高速2〜3秒。lib/userPathHistory.tsのintervalMsForSpeedKmh参照)。
  // 速度が判定できるまでの初期値として、徒歩程度の間隔を入れておく。
  const dynamicSyncIntervalMsRef = useRef(12000);
  // 速度のフォールバック計算(coords.speedが取得できない場合)用に、直前の
  // 生fix(距離フィルタ前・全fix)の座標・時刻を保持しておく。
  const lastRawFixForSpeedRef = useRef<PathPoint | null>(null);
  // myPathHistoryへの記録を動的間隔(dynamicSyncIntervalMsRef)でスロットリング
  // するための直近記録時刻。
  const lastAcceptedFixAtRef = useRef(0);
  // 停止中(移動していない)でもuser_locationsのupdatedAt/positionが古いままに
  // ならないよう、GPS追跡ONの間は定期的にハートビート同期をチェックする間隔。
  // 実際に送信するかどうかはdynamicSyncIntervalMsRefで判定するため、
  // このタイマー自体は動的間隔より十分細かい間隔で回しておけばよい。
  const HEARTBEAT_CHECK_INTERVAL_MS = 5000; // 5秒ごとにチェック

  // 同組織の他クルーの実機位置(Firestore user_locationsをリアルタイム購読)。
  // これまでダミーデータ(lib/dummyCrew.ts)を表示していたピンを実データに置き換える。
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([]);

  // setIntervalのクロージャが古いstateを参照し続けないよう、最新値をrefにも
  // 保持しておく(effect自体はgpsTracking/profileが変わるまで張り直したくないため)。
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;
  const myStatusRef = useRef(myStatus);
  myStatusRef.current = myStatus;
  const myPathHistoryRef = useRef(myPathHistory);
  myPathHistoryRef.current = myPathHistory;

  // 「待機中」の状態で地図の「現在地を表示」ボタンを押した際、現在地ピンを
  // 常時表示するのではなく一時的にのみ表示するためのフラグとタイマー。
  // (「出動中」ステータスとの整合性を保つため、待機中は自動的に消える)
  const [tempLocationVisible, setTempLocationVisible] = useState(false);
  const tempLocationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const TEMP_LOCATION_VISIBLE_MS = 20000; // 一時表示を維持する時間(20秒)

  const GPS_TRACKING_STORAGE_KEY = "spotbase.gpsTrackingEnabled";
  // 東京駅周辺（位置情報が拒否/取得失敗した場合のフォールバック座標）
  const DEFAULT_LOCATION = { lat: 35.681236, lng: 139.767125 };

  useEffect(() => {
    // ハイドレーション完了を示す
    setMounted(true);
    // 前回のGPS追跡ON/OFF状態をlocalStorageから復元する処理:
    // AUTO_REQUEST_LOCATION_ON_LOADがfalseの間は、これによってgpsTrackingが
    // 勝手にtrueへ復元され、continuous watchPosition用のuseEffectが起動時に
    // ブラウザの位置情報許可ポップアップを表示してしまうのを避けるため、
    // 復元自体をスキップする(GPS追跡状態は常にOFFから開始)。
    // localStorageの読み書きロジック自体は保持している。
    if (AUTO_REQUEST_LOCATION_ON_LOAD) {
      try {
        const stored = window.localStorage.getItem(GPS_TRACKING_STORAGE_KEY);
        if (stored === "true") {
          setGpsTracking(true);
        }
      } catch (error) {
        console.warn("GPS追跡状態の読み込みに失敗しました:", error);
      }
    }

    // 自分の移動経路をlocalStorageから復元(リロード後も経路が消えないようにする)
    setMyPathHistory(loadPathFromStorage());

    return () => {
      if (tempLocationTimerRef.current) {
        clearTimeout(tempLocationTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 「出動中」に切り替わったら、待機中用の一時表示タイマーは不要になるので破棄する
  // (以後は常時表示のuserLocation側の条件でピンが表示されるため)
  useEffect(() => {
    if (gpsTracking && tempLocationTimerRef.current) {
      clearTimeout(tempLocationTimerRef.current);
      tempLocationTimerRef.current = null;
      setTempLocationVisible(false);
    }
  }, [gpsTracking]);

  // 自分の移動経路が更新されるたびにlocalStorageへ保存する
  // (DB未接続時のフォールバック。リロード後も経路が消えないようにする)。
  useEffect(() => {
    if (!mounted) return; // マウント前(localStorageから復元する前)に空配列で上書きしてしまうのを防ぐ
    savePathToStorage(myPathHistory);
  }, [myPathHistory, mounted]);

  // 自分の移動経路をFirestoreへも非同期で同期する(ベストエフォート。
  // 書き込み頻度を抑えるため、前回同期からdynamicSyncIntervalMsRef(移動速度に
  // 応じて動的に変わる間隔)以上経過している場合のみ実行する)。
  // 失敗してもlocalStorage側には影響しない。
  useEffect(() => {
    // Firebase Authのセッションが未確立(再ログイン待ち等)の間は、どうせ
    // permission-deniedになるだけのFirestore書き込みを試みない。userが
    // 依存配列に入っているため、ログイン完了(userがnull→非nullに変化)した
    // タイミングで本effectが再評価され、以降は正常に同期される。
    if (!mounted || !user || !profile || myPathHistory.length === 0) return;
    const now = Date.now();
    if (now - lastFirestoreSyncAtRef.current < dynamicSyncIntervalMsRef.current) return;
    lastFirestoreSyncAtRef.current = now;
    syncPathToFirestore(profile.uid, profile.organizationId, profile.category, profile.name, myPathHistory, {
      status: myStatus,
      phone: profile.phone,
      position: userLocation ?? undefined,
    });
    // 日別の移動履歴(location_histories)も同時に蓄積する。isOnline状態には
    // 依存しないため、GPSがOFFになっても既に書き込んだ日の履歴は消えない。
    syncDailyLocationHistory(profile.uid, profile.organizationId, myPathHistory);
  }, [myPathHistory, mounted, user, profile, myStatus, userLocation]);

  // 移動していない間もuser_locationsの位置・ステータス・updatedAtが古いままに
  // ならないよう、GPS追跡ON中は一定間隔でハートビート同期を行う(上のeffectは
  // myPathHistoryが変化した時=一定距離動いた時にしか発火しないため、停止中は
  // このタイマーが無いと管理者画面の「最終更新」がどんどん古くなってしまう)。
  // このタイマー自体はHEARTBEAT_CHECK_INTERVAL_MS(5秒)ごとに細かくチェックする
  // だけで、実際に送信するかどうかはdynamicSyncIntervalMsRef(移動速度に応じた
  // 動的間隔)で判定する。これにより、停止中は30秒〜1分に1回、高速移動中は
  // 2〜3秒に1回など、ハートビートも記録・送信間隔の動的切替に追従する。
  // 依存配列を[gpsTracking, mounted, profile]に絞り、位置更新のたびにタイマーが
  // 張り直されないようにするため、最新値はref(userLocationRef等)経由で参照する。
  useEffect(() => {
    // userを依存配列に含め、ログイン完了/セッション切れ復帰のたびに
    // タイマーを張り直す(未ログイン中はFirestore書き込みを試みない)。
    if (!mounted || !user || !profile || !gpsTracking) return;
    const interval = setInterval(() => {
      const loc = userLocationRef.current;
      if (!loc) return;
      const now = Date.now();
      if (now - lastFirestoreSyncAtRef.current < dynamicSyncIntervalMsRef.current) return;
      lastFirestoreSyncAtRef.current = now;
      syncPathToFirestore(
        profile.uid,
        profile.organizationId,
        profile.category,
        profile.name,
        myPathHistoryRef.current,
        { status: myStatusRef.current, phone: profile.phone, position: loc }
      );
      syncDailyLocationHistory(profile.uid, profile.organizationId, myPathHistoryRef.current);
    }, HEARTBEAT_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [mounted, user, profile, gpsTracking]);

  // 同組織のクルー(自分自身を含む)の実機位置(user_locations)をリアルタイム
  // 購読し、地図に渡す。以前は自分自身のドキュメントをここで除外していたが、
  // その場合ローカルのgpsTrackingがONになっていない別デバイス/別タブから
  // 地図を開くと自分のピンが全く表示されないという問題があったため、
  // isSelf:true付きでそのまま含めるようにした(区別はMap.tsx側で行う)。
  // 依存配列にuserを含めることで、ログイン完了(Auth状態の変化でuserがnullから
  // 実値に変わったタイミング)や再ログイン後に、自動的に購読が再実行される。
  useEffect(() => {
    if (!user || !profile) {
      setCrewMembers([]);
      return;
    }
    const unsubscribe = subscribeCrewLocations(profile.organizationId, profile.uid, setCrewMembers);
    return () => unsubscribe();
  }, [user, profile]);

  // 現場一次情報(field_notes)のリアルタイム購読。同組織のactive分のみ。
  useEffect(() => {
    if (!user || !profile) {
      setFieldNotes([]);
      return;
    }
    const unsubscribe = subscribeActiveFieldNotes(profile.organizationId, setFieldNotes);
    return () => unsubscribe();
  }, [user, profile]);

  async function handleCreateFieldNote(input: {
    lat: number;
    lng: number;
    category: FieldNoteCategory;
    comment: string;
    tags?: string[];
    contactInfo?: string;
  }) {
    if (!profile) throw new Error("プロフィール未取得のため投稿できません");
    await createFieldNote({
      organizationId: profile.organizationId,
      authorUid: profile.uid,
      authorName: profile.name,
      category: input.category,
      comment: input.comment,
      lat: input.lat,
      lng: input.lng,
      tags: input.tags,
      contactInfo: input.contactInfo,
    });
  }

  async function handleResolveFieldNote(fieldNoteId: string) {
    if (!profile) return;
    try {
      await resolveFieldNote(fieldNoteId, profile.uid);
    } catch (err) {
      console.error("[FieldNote] failed to resolve:", err);
    }
  }

  // ログイン完了(auth状態がuser: null → 実ユーザーに変化)を検知したタイミングで、
  // GPS追跡が既にON(前回セッションからlocalStorageで復元された状態)であれば
  // 初回位置送信を1回だけ強制実行する。上のmyPathHistory依存effectは経路が
  // 変化するまで発火しないため、再ログイン直後にuser_locationsが古いまま
  // 放置されるのを防ぐ。
  useEffect(() => {
    if (!mounted || !user || !profile || !gpsTracking) return;
    const loc = userLocationRef.current;
    if (!loc) return;
    console.log("[GPS Debug][ログイン] Auth状態変化を検知したため初回位置送信を実行します", {
      uid: profile.uid,
      organizationId: profile.organizationId,
    });
    lastFirestoreSyncAtRef.current = Date.now();
    syncPathToFirestore(profile.uid, profile.organizationId, profile.category, profile.name, myPathHistoryRef.current, {
      status: myStatusRef.current,
      phone: profile.phone,
      position: loc,
    });
    // userが変化した(=ログイン/再ログインが完了した)タイミングでのみ実行したいため、
    // 依存はuser/mounted/profileに絞る(loc/gpsTrackingは最新値をrefから読む)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, mounted, profile]);

  // 地図の「現在地を表示」ボタン(LocateControl)が現在地取得に成功した際のコールバック。
  // 「待機中」の場合でも一時的に現在地ピンを表示できるようにしつつ、「出動中」表示との
  // 整合性を保つため、一定時間後(TEMP_LOCATION_VISIBLE_MS)に自動で非表示へ戻す。
  function handleLocated(loc: { lat: number; lng: number }) {
    setUserLocation(loc);
    if (!gpsTracking) {
      setTempLocationVisible(true);
      if (tempLocationTimerRef.current) {
        clearTimeout(tempLocationTimerRef.current);
      }
      tempLocationTimerRef.current = setTimeout(() => {
        setTempLocationVisible(false);
        tempLocationTimerRef.current = null;
      }, TEMP_LOCATION_VISIBLE_MS);
    }
  }

  // 現在地を1回だけ取得するヘルパー。第1試行(高精度)がタイムアウト/エラーの場合、
  // 即座に第2試行(低精度: Wi-Fi/基地局測位)にフォールバックする2段階方式。
  // 両方失敗した場合は例外を投げる。
  function getCurrentPositionWithFallback(): Promise<{ lat: number; lng: number }> {
    return new Promise((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reject(new Error("この端末/環境では位置情報が利用できません"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (error) => {
          console.warn("[GPS Error] 第1試行(高精度)失敗。低精度で即再試行します:", error);
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            },
            (error2) => {
              console.warn("[GPS Error] 第2試行(低精度)も失敗:", error2);
              reject(error2);
            },
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 }
          );
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    });
  }

  // getCurrentPositionWithFallback自体は各試行にtimeoutを設定しているが、
  // 端末/WebView側の実装によってはtimeoutが機能せずコールバックが一切
  // 呼ばれないまま停止するケースがある(特にCapacitor/WKWebViewで権限確認
  // ダイアログが絡む場合)。その場合でもトグルON操作自体を止めないよう、
  // GPS_TOGGLE_TIMEOUT_MS経過したら既知の座標(直近のuserLocation、無ければ
  // DEFAULT_LOCATION)にフォールバックして処理を進める。
  const GPS_TOGGLE_TIMEOUT_MS = 8000;

  async function getLocationForGpsToggleOn(): Promise<{ lat: number; lng: number }> {
    const fallback = userLocationRef.current ?? DEFAULT_LOCATION;
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        console.warn(
          "[GPS Debug][トグルON] 現在地取得が" + GPS_TOGGLE_TIMEOUT_MS + "ms以内に完了しなかったため、既知の座標にフォールバックします:",
          fallback
        );
        resolve(fallback);
      }, GPS_TOGGLE_TIMEOUT_MS);

      getCurrentPositionWithFallback()
        .then((loc) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(loc);
        })
        .catch((error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          console.warn("[GPS Debug][トグルON] 現在地取得に失敗したため、既知の座標にフォールバックします:", error, fallback);
          resolve(fallback);
        });
    });
  }

  // ステータスボタンから呼ばれるON/OFF切り替えハンドラ。
  // 「待機中→出動中」への切り替え時のみ、現在地を強制的に取得してから
  // ステータスを更新する。現在地が取得できない場合も既知の座標に
  // フォールバックして必ずuser_locations/{uid}への書き込みまで到達させる
  // (完全に位置情報が使えない端末/環境の場合のみキャンセルする)。
  // 「出動中→待機中」への切り替えはGPS取得不要のため即座に反映する。
  async function handleToggleGpsTracking() {
    console.log("[GPS Debug][トグル] handleToggleGpsTracking呼び出し", {
      現在のgpsTracking: gpsTracking,
      uid: profile?.uid,
      organizationId: profile?.organizationId,
      gpsAcquiring,
    });

    if (gpsAcquiring) {
      console.log("[GPS Debug][トグル] gpsAcquiring中のため連打防止でスキップ");
      return; // 連打防止
    }

    if (gpsTracking) {
      // 出動中 → 待機中: 即座に切り替え
      console.log("[GPS Debug][トグル] 出動中→待機中に切り替えます");
      setGpsTracking(false);
      try {
        window.localStorage.setItem(GPS_TRACKING_STORAGE_KEY, "false");
      } catch (error) {
        console.warn("GPS追跡状態の保存に失敗しました:", error);
      }
      // GPS OFF(停止処理)を検知したので、user_locations/{uid}を
      // isOnline:falseに更新し、地図上から自分のピンを即座に消す。
      // (位置履歴自体は消さない。location_historiesは別途保持されている)
      if (profile) {
        setUserLocationOffline(profile.uid);
      }
      return;
    }

    if (!profile) {
      console.warn("[GPS Debug][トグル] profileが未取得のため出動中への切り替えを中止します");
      return;
    }

    // 待機中 → 出動中: 現在地の取得を試みつつ、必ずONへ切り替える
    setGpsAcquiring(true);
    try {
      const loc = await getLocationForGpsToggleOn();
      console.log("[GPS Debug][トグル] トグルON用の座標が確定しました:", loc);
      setUserLocation(loc);
      // 地図の初期表示(東京中心)をGPS取得結果で勝手に動かさないよう、
      // ここでの自動カメラ移動(setFlyTo)は無効化している。
      // 位置情報の取得・保持ロジック自体は変更していない。
      // setFlyTo(loc);
      // 取得済みなので、continuousなwatchPosition側の初回自動センタリングも発生させない
      hasCenteredOnGpsRef.current = true;

      // 既存のwatchPositionが残っていれば完全に削除してから、
      // 下のuseEffect(gpsTracking)がフレッシュなwatchPositionを開始する
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }

      setGpsTracking(true);
      try {
        window.localStorage.setItem(GPS_TRACKING_STORAGE_KEY, "true");
      } catch (error) {
        console.warn("GPS追跡状態の保存に失敗しました:", error);
      }

      // GPSトラッキングON操作から実際にFirestoreへ書き込まれるまでの間、
      // myPathHistoryの変化(10m以上の移動)やハートビート(最大20秒後)を
      // 待っていると、管理者/他クルー側にピンが反映されるまで遅延してしまう。
      // ここで確定したloc・organizationIdを使って即座に1回同期しておく。
      lastFirestoreSyncAtRef.current = Date.now();
      console.log("[GPS Debug][トグル] syncPathToFirestoreを即時実行します", {
        uid: profile.uid,
        organizationId: profile.organizationId,
        loc,
      });
      syncPathToFirestore(profile.uid, profile.organizationId, profile.category, profile.name, myPathHistoryRef.current, {
        status: myStatusRef.current,
        phone: profile.phone,
        position: loc,
      })
        .then(() => {
          console.log("[GPS Debug][トグル] syncPathToFirestore(即時)が完了しました");
        })
        .catch((error) => {
          // syncPathToFirestore自体は内部でcatch済み(スロー無し)だが、
          // 呼び出し経路の変更に備えて念のためここでもログを残す
          console.error("[GPS Error][トグル] syncPathToFirestore(即時)で予期しないエラー:", error);
        });
      syncDailyLocationHistory(profile.uid, profile.organizationId, myPathHistoryRef.current);
    } catch (error) {
      // getLocationForGpsToggleOnはフォールバックにより通常reject/throwしないため、
      // ここに来るのは navigator.geolocation自体が存在しない等、致命的なケースのみ。
      console.error("[GPS Error] 出動中への切り替えに失敗しました:", error);
      window.alert("位置情報を取得できませんでした。端末の位置情報設定を確認してください");
      // 待機中のまま維持(状態変更をキャンセル)
    } finally {
      setGpsAcquiring(false);
    }
  }

  // 初回位置取得: GPS追跡(継続監視)がOFFのままだと現在地が一切表示されないため、
  // ログイン後に一度だけ位置情報を取得して地図上の現在地ピンを初期表示する。
  // 二段階フォールバック: 高精度(5000ms)→失敗時は標準精度(8000ms)で再試行。
  //
  // AUTO_REQUEST_LOCATION_ON_LOADがfalseの間は、ブラウザの位置情報許可ポップアップを
  // 起動時に勝手に表示させないため、navigator.geolocationの呼び出し自体を行わず、
  // 常にデフォルト座標(東京)にフォールバックする。取得ロジックそのものは
  // 下に残しており、フラグをtrueに戻すか明示的なユーザー操作から呼び出せば動作する。
  useEffect(() => {
    if (authLoading || !user || !profile) return;

    if (!AUTO_REQUEST_LOCATION_ON_LOAD) {
      setUserLocation((prev) => prev ?? DEFAULT_LOCATION);
      return;
    }

    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.geolocation
    ) {
      console.warn("[GPS Error] この端末/環境では位置情報が利用できません");
      setUserLocation((prev) => prev ?? DEFAULT_LOCATION);
      return;
    }

    console.log("[GPS Debug] 初回位置情報の取得を開始します(高精度, timeout 5000ms)");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        console.log("[GPS Debug] 初回取得成功(高精度):", pos);
        setUserLocation(loc);
      },
      (error) => {
        console.warn("[GPS Error] 初回取得失敗(高精度)。標準精度で再試行します:", error);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            console.log("[GPS Debug] 初回取得成功(標準精度):", pos);
            setUserLocation(loc);
          },
          (error2) => {
            console.warn(
              "[GPS Error] 初回取得失敗(標準精度)。デフォルト座標を使用します:",
              error2
            );
            setUserLocation((prev) => prev ?? DEFAULT_LOCATION);
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 5000 }
        );
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 5000 }
    );
  }, [authLoading, user, profile]);

  // GPS追跡(継続監視)。「出動中[GPS ON]」ボタンでONにしている間だけ、
  // watchPositionで現在地を継続的に更新し続ける(バッテリー消費を抑えるため
  // OFF時は自動停止)。こちらも高精度→標準精度の二段階フォールバックを行う。
  useEffect(() => {
    // ログイン(認証完了)前は何もしない
    if (authLoading || !user || !profile) return;

    // 待機中(OFF): 実行中の追跡があれば安全に停止してバッテリー消費を抑え、
    // メモリ上に保持している現在地座標もクリアする(地図上のGPSピンを非表示にするため)
    if (!gpsTracking) {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setUserLocation(null);
      return;
    }

    // 出動中(ON): 現在地の継続追跡を開始。
    // (handleToggleGpsTrackingで既に一度取得・中心移動済みの場合はhasCenteredOnGpsRef.currentが
    //  trueになっているため、ここでは意図的にリセットしない。localStorage復元等で
    //  直接ONになったケースのみ、refの初期値falseのまま初回の継続取得時に中心移動する)

    // 既存のwatchPositionが残っていれば完全に削除してからフレッシュに開始する
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      console.warn("[GPS Error] この端末/環境では位置情報が利用できません");
      setUserLocation((prev) => prev ?? DEFAULT_LOCATION);
      return;
    }

    let usingStandardAccuracy = false;

    function handleFix(position: GeolocationPosition) {
      const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
      const now = position.timestamp || Date.now();
      console.log(
        `[GPS Debug] 継続追跡取得成功(${usingStandardAccuracy ? "標準精度" : "高精度"}):`,
        position
      );

      // 移動速度を判定し、GPS記録・送信間隔を動的に切り替える(要件:
      // 停止中30秒〜1分/徒歩10〜15秒/高速(車・電車等)2〜3秒)。
      // GeolocationPosition.coords.speed(m/s)が取得できればそれを優先し、
      // 取得できない端末/ブラウザの場合は直前fixとの距離・経過時間から
      // 簡易フォールバックで速度を推定する。
      let speedMs = position.coords.speed;
      if (speedMs == null || !Number.isFinite(speedMs) || speedMs < 0) {
        const prevRaw = lastRawFixForSpeedRef.current;
        if (prevRaw) {
          const dtSec = (now - prevRaw.timestamp) / 1000;
          if (dtSec > 0.5) {
            speedMs = distanceMeters(prevRaw, loc) / dtSec;
          }
        }
      }
      lastRawFixForSpeedRef.current = { lat: loc.lat, lng: loc.lng, timestamp: now };
      const speedKmh = speedMs != null && Number.isFinite(speedMs) ? Math.max(0, speedMs) * 3.6 : 0;
      dynamicSyncIntervalMsRef.current = intervalMsForSpeedKmh(speedKmh);

      setUserLocation(loc);
      // 地図の初期表示(東京中心)をGPS取得結果で勝手に動かさないよう、
      // ここでの自動カメラ移動(setFlyTo)は無効化している。
      // 位置情報の取得・保持ロジック(setUserLocation)自体は維持している。
      if (!hasCenteredOnGpsRef.current) {
        // setFlyTo(loc);
        hasCenteredOnGpsRef.current = true;
      }

      // 記録スロットリング: 動的間隔(dynamicSyncIntervalMsRef)より短い間隔で
      // 来たfixは経路記録の対象にしない(停止中は間引いてバッテリー/書き込み量を
      // 節約し、高速移動中は逆に細かく記録する)。
      if (now - lastAcceptedFixAtRef.current < dynamicSyncIntervalMsRef.current) return;
      lastAcceptedFixAtRef.current = now;

      // 実機の移動経路として蓄積する。GPS誤差によるブレを防ぐため、直前の記録点から
      // 一定距離(既定8m)以上移動した場合のみ追加する(lib/userPathHistory.ts参照)。
      const point: PathPoint = { lat: loc.lat, lng: loc.lng, timestamp: now };
      setMyPathHistory((prev) => (shouldAppendPoint(prev, point) ? appendPoint(prev, point) : prev));
    }

    // enableHighAccuracy: trueを指定し、GPSチップ(可能な端末では)による高精度
    // 測位を使う。maximumAgeは経路描画の精度・追従性を上げるため5000msから
    // 3000msに短縮し、古いキャッシュ位置を使い回す期間を減らしている。
    console.log("[GPS Debug] 継続追跡を開始します(高精度, timeout 5000ms, maximumAge 3000ms)");
    let id = navigator.geolocation.watchPosition(
      handleFix,
      (error) => {
        console.warn("[GPS Error] 継続追跡失敗(高精度)。標準精度で再試行します:", error);
        // 権限拒否の場合は標準精度でも許可されないため、再試行せずフォールバック座標を使う
        if (error.code === error.PERMISSION_DENIED) {
          setUserLocation((prev) => prev ?? DEFAULT_LOCATION);
          // GPSがOFF(権限拒否)になったことを検知したので、他クルー側の
          // 地図からは自分のピンを即座に消す(isOnline:false)。
          if (profile) {
            setUserLocationOffline(profile.uid);
          }
          return;
        }
        // 高精度側のwatchをやめて標準精度で張り直す
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
        usingStandardAccuracy = true;
        id = navigator.geolocation.watchPosition(
          handleFix,
          (error2) => {
            console.warn("[GPS Error] 継続追跡失敗(標準精度)。デフォルト座標を使用します:", error2);
            setUserLocation((prev) => prev ?? DEFAULT_LOCATION);
            // 高精度・標準精度の両方が失敗した=実質的にGPSが使えない状態
            // なので、こちらもisOnline:falseに更新して自分のピンを消す。
            if (profile) {
              setUserLocationOffline(profile.uid);
            }
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 5000 }
        );
        watchIdRef.current = id;
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 3000 }
    );
    watchIdRef.current = id;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [authLoading, user, profile, gpsTracking]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (!profile) return; // プロフィール未整備(管理者にアカウント設定を確認してもらう)
    // photoモード("ここトレ！")では、pro向けの"pins"コレクションには一切アクセスしない
    // (データ分離。photoSpots取得は別のuseEffectで"photo_spots"コレクションのみを見る)
    if (APP_MODE === "photo") return;

    Promise.allSettled([
      getAllPins({
        organizationId: profile.organizationId,
        category: profile.category,
        isAdmin: profile.accessLevel === "admin",
      }),
      getHighUrgencyIncidents(profile.organizationId),
      getDispatchRecords({
        organizationId: profile.organizationId,
        category: profile.category,
        isAdmin: profile.accessLevel === "admin",
      }),
    ])
      .then((results) => {
        const pinsResult = results[0];
        const incidentsResult = results[1];
        const dispatchResult = results[2];
        // breakingAlerts はクライアント側の useBreakingAlerts フックで自動管理

        let pinsData =
          pinsResult.status === "fulfilled" ? pinsResult.value : [];

        // Calculate dispatch count for each pin
        const dispatchRecords =
          dispatchResult.status === "fulfilled" ? dispatchResult.value : [];

        const dispatchCountByLocation: Record<string, number> = {};
        dispatchRecords.forEach((record) => {
          const key = `${record.locationName}`;
          dispatchCountByLocation[key] = (dispatchCountByLocation[key] || 0) + 1;
        });

        // Sort pins by dispatch count (descending)
        pinsData = pinsData
          .map((pin) => ({
            ...pin,
            dispatchCount: dispatchCountByLocation[pin.name] || 0,
          }))
          .sort((a, b) => (b.dispatchCount || 0) - (a.dispatchCount || 0));

        let incidentsData: Incident[] = [];
        if (incidentsResult.status === "fulfilled") {
          incidentsData = incidentsResult.value;
          console.log(`Loaded ${incidentsData.length} incidents from Firestore`);
        } else {
          // エラー時は空配列を返す（ダミーデータは使用しない）
          console.warn(
            "Failed to load incidents from Firestore:",
            incidentsResult.reason
          );
          incidentsData = [];
        }

        setPins(pinsData);
        setIncidents(incidentsData);
        // breakingAlerts はクライアント側の useBreakingAlerts フックで自動管理
      })
      .catch((error) => {
        console.error("Unexpected error loading data:", error);
        setLoading(false);
      })
      .finally(() => setLoading(false));
  }, [authLoading, user, profile, router]);

  // 「ここトレ！」(photoモード)専用: "photo_spots"コレクションのみを取得する。
  // pro向けの上のuseEffect("pins"コレクション)とは完全に独立しており、互いのデータには触れない。
  useEffect(() => {
    if (APP_MODE !== "photo") return;
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (!photoProfile) return;

    setLoadingPhotoSpots(true);
    getAllPhotoSpots()
      .then(setPhotoSpots)
      .catch((error) => {
        console.error("ここトレ！: photo_spotsの取得に失敗しました", error);
      })
      .finally(() => setLoadingPhotoSpots(false));
  }, [authLoading, user, photoProfile, router]);

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  // ヘッダーの「＋現場記録」から開くSuperScout風モーダルの送信処理。
  // 写真が指定されていれば先にFirebase Storageへアップロードし、
  // そのURLを含めてfield_notesドキュメントを作成する。
  async function handleCreateSiteRecord(input: {
    name: string;
    referenceId?: string;
    address?: string;
    addressNote?: string;
    lat: number;
    lng: number;
    category: FieldNoteCategory;
    tags: string[];
    comment: string;
    contactInfo?: string;
    privateNote?: string;
    imageFiles: File[];
    drawingFiles: File[];
    customFields: FieldNoteCustomField[];
  }) {
    if (!profile || creatingSiteRecord) return;
    setCreatingSiteRecord(true);
    setSiteRecordError("");
    try {
      const tempId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      let images: string[] | undefined;
      if (input.imageFiles.length > 0) {
        images = await uploadFieldNoteImages(tempId, input.imageFiles);
      }
      let drawings: FieldNoteDrawing[] | undefined;
      if (input.drawingFiles.length > 0) {
        drawings = await uploadFieldNoteDrawings(
          tempId,
          input.drawingFiles,
          profile.name
        );
      }
      await createFieldNote({
        organizationId: profile.organizationId,
        authorUid: profile.uid,
        authorName: profile.name,
        category: input.category,
        comment: input.comment,
        lat: input.lat,
        lng: input.lng,
        tags: input.tags,
        contactInfo: input.contactInfo,
        images,
        drawings,
        name: input.name,
        referenceId: input.referenceId,
        address: input.address,
        addressNote: input.addressNote,
        privateNote: input.privateNote,
        customFields: input.customFields,
      });
      setShowSiteRecordForm(false);
    } catch (error) {
      console.error("現場記録の作成に失敗しました:", error);
      setSiteRecordError("現場記録の作成に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setCreatingSiteRecord(false);
    }
  }

  // 検索結果のメモ化 - 検索クエリまたはピン配列が変更された場合のみ再計算
  const filtered = useMemo(() => searchPins(pins, query), [pins, query]);

  // 属性絞り込み(タグ/図面有無/最終更新日)適用 - フリーワード検索の結果にさらに絞り込む
  const filteredByAttributes = useMemo(
    () => filterPinsByAttributes(filtered, attributeFilters),
    [filtered, attributeFilters]
  );

  // ロケーションフィルター適用 - parentLocation が選択されている場合のみフィルタリング
  const filteredByLocation = useMemo(() => {
    if (!selectedLocationFilter) return filteredByAttributes;
    return filteredByAttributes.filter((pin) =>
      getParentLocation(pin) === selectedLocationFilter
    );
  }, [filteredByAttributes, selectedLocationFilter]);

  // フィルター適用時に地図の中心座標を計算
  useEffect(() => {
    if (selectedLocationFilter && filteredByLocation.length > 0) {
      const avgLat = filteredByLocation.reduce((sum, pin) => sum + pin.lat, 0) / filteredByLocation.length;
      const avgLng = filteredByLocation.reduce((sum, pin) => sum + pin.lng, 0) / filteredByLocation.length;
      setFlyTo({ lat: avgLat, lng: avgLng });
    }
  }, [selectedLocationFilter, filteredByLocation]);

  // 検索結果(登録済みピン)が1件に絞られたら、その場所へ地図を自動的に移動する
  useEffect(() => {
    if (query.trim()) {
      const results = searchPins(pins, query);
      if (results.length === 1) {
        setFlyTo({ lat: results[0].lat, lng: results[0].lng });
        setSearchMarker(null);
      }
    }
  }, [query, pins]);

  // 指定した地点の「駐車候補」「駐停車候補」をまとめて検索する。
  // 各検索は道路種別ごとの複数ブロックに分割して並行実行され、
  // 1ブロックの結果が届くたびに onBatch 経由で state を随時更新する
  // (見つかった場所から順に地図へ反映されるプログレッシブ表示)。
  async function loadLocationInsights(lat: number, lng: number) {
    setRoadSuggestions([]);
    setStopSuggestions([]);
    setLoadingRoads(true);
    setLoadingStops(true);
    findWideRoadsNear(lat, lng, 600, 5, (batch) => setRoadSuggestions(batch))
      .then(setRoadSuggestions)
      .catch((err) => console.error(err))
      .finally(() => setLoadingRoads(false));
    findStoppableRoadsNear(lat, lng, 150, 5, (batch) => setStopSuggestions(batch))
      .then(setStopSuggestions)
      .catch((err) => console.error(err))
      .finally(() => setLoadingStops(false));
  }

  // 現場ピンを選択する処理（2段階クリック対応）
  // 1回目クリック: ピン選択 + 地図中央移動（詳細パネルは開かない）
  // 2回目クリック: 詳細パネル開閉
  function handleSelectPin(pin: Pin) {
    // すでに選択されているピンを再度クリックした場合は詳細パネルを開く
    if (selectedPin && selectedPin.id === pin.id) {
      setShowDetailPanel(!showDetailPanel);
      return;
    }

    // 新しいピンが選択された場合
    setSelectedPin(pin);
    setShowDetailPanel(false); // 詳細パネルを閉じる
    setSearchMarker(null);

    // 座標が有効か確認（null/undefined/不正な値を除外）
    if (pin.lat && pin.lng && typeof pin.lat === 'number' && typeof pin.lng === 'number') {
      setFlyTo({ lat: pin.lat, lng: pin.lng });
    } else {
      // 座標が無効な場合はマップをリセット
      setFlyTo(null);
      console.warn(`ピン ${pin.id} の座標が無効です: (${pin.lat}, ${pin.lng})`);
    }
  }

  // 現場一覧の「開く」ボタン用ハンドラ。
  // 選択中の現場アイテムにのみ表示される明示的なボタンから呼ばれ、
  // 押し間違い防止のため常に「開く」方向にのみ動作する（トグルしない）。
  // 未選択・別のピンが選択中の場合は、先に選択+地図移動を行ってから開く。
  function handleOpenPinDetail(pin: Pin) {
    if (!selectedPin || selectedPin.id !== pin.id) {
      handleSelectPin(pin);
    }
    setShowDetailPanel(true);
  }

  function handleCloseSidePanel() {
    setSelectedPin(null);
    setShowDetailPanel(false);
    setSearchMarker(null);
    setRoadSuggestions([]);
    setStopSuggestions([]);
  }

  function handlePinDeleted() {
    if (!selectedPin) return;
    setPins((prev) => prev.filter((p) => p.id !== selectedPin.id));
    setSelectedPin(null);
    setShowDetailPanel(false);
    setSearchMarker(null);
    setRoadSuggestions([]);
    setStopSuggestions([]);
  }

  // Enterキーで検索を確定した時の処理。
  // 登録済みピンにヒットしなければ、Nominatimで地名・住所として検索する。
  async function handleSubmit(q: string) {
    setGeocodeError("");
    const trimmed = q.trim();
    if (!trimmed) return;

    const matched = searchPins(pins, trimmed);
    if (matched.length > 0) {
      setFlyTo({ lat: matched[0].lat, lng: matched[0].lng });
      setSearchMarker(null);
      handleSelectPin(matched[0]);
      return;
    }

    setGeocoding(true);
    try {
      const results = await geocodeQuery(trimmed);
      if (results.length === 0) {
        setGeocodeError("場所が見つかりませんでした");
        return;
      }
      const top = results[0];
      setFlyTo({ lat: top.lat, lng: top.lng });
      setSearchMarker({ lat: top.lat, lng: top.lng, label: trimmed, address: top.displayName });
      setSelectedPin(null);
      loadLocationInsights(top.lat, top.lng);
    } catch (err) {
      console.error(err);
      setGeocodeError("検索に失敗しました");
    } finally {
      setGeocoding(false);
    }
  }

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100 text-sm text-gray-500">
        読み込み中...
      </div>
    );
  }

  if (user && !profile) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-sm text-center space-y-3">
          <p className="text-sm text-gray-700">
            アカウントのプロフィール情報が見つかりませんでした。管理者に確認してください。
          </p>
          <button
            onClick={handleLogout}
            className="text-sm text-blue-600 hover:underline"
          >
            ログアウト
          </button>
        </div>
      </div>
    );
  }

  // 「ここトレ！」(写真モード): ギャラリー中心のPC向け2カラムレイアウトに差し替える。
  // 本体(pro)向けの既存レイアウト(出動記録・現場一覧など)はここでは使わない。
  if (APP_MODE === "photo") {
    // 投稿完了後、TOPギャラリー・地図にすぐ反映されるよう"photo_spots"を取り直す
    async function refetchPhotoSpots() {
      const spotsData = await getAllPhotoSpots();
      setPhotoSpots(spotsData);
    }

    return (
      <div className="w-full max-w-full overflow-x-hidden flex flex-col bg-gray-100 h-screen">
        <div className="relative z-[9999] bg-white border-b border-gray-200 flex-shrink-0">
          <HeaderNav
            profile={toDisplayProfile(photoProfile)}
            onLogout={handleLogout}
            onToggleMenu={() => setMenuOpen(!menuOpen)}
            onNewPhotoSpot={() => setShowPhotoUploadModal(true)}
          />
        </div>
        <PhotoGalleryView spots={photoSpots} loading={loadingPhotoSpots} initialSpotId={initialPhotoSpotId} />
        {showPhotoUploadModal && (
          <PhotoUploadModal
            onClose={() => setShowPhotoUploadModal(false)}
            onCreated={refetchPhotoSpots}
          />
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden flex flex-col bg-gray-100 min-h-screen md:min-h-screen md:h-screen">
      {/* ========== DESKTOP LAYOUT (md+) ========== */}
      <div className="hidden md:flex md:flex-col w-full h-full mx-auto p-4 sm:p-6 gap-2 sm:gap-3">
        <div className="relative z-[9999] bg-white border border-gray-200 rounded-lg sm:rounded-xl shadow-sm flex-shrink-0">
          <HeaderNav
            profile={profile}
            onLogout={handleLogout}
            onToggleMenu={() => setMenuOpen(!menuOpen)}
            gpsTracking={gpsTracking}
            gpsAcquiring={gpsAcquiring}
            onToggleGpsTracking={handleToggleGpsTracking}
            onNewSiteRecord={() => setShowSiteRecordForm(true)}
          />
          <div className="border-t border-gray-100 relative z-40 flex items-center">
            <div className="flex-1 min-w-0">
              <SearchBar
                onSearch={setQuery}
                onSubmit={handleSubmit}
                loading={geocoding}
                onClear={() => {
                  setSearchMarker(null);
                  setSelectedPin(null);
                  setRoadSuggestions([]);
                  setStopSuggestions([]);
                  setGeocodeError("");
                }}
              />
              {geocodeError && (
                <p className="px-3 sm:px-4 pb-2 text-xs text-red-600">{geocodeError}</p>
              )}
            </div>
            <div className="pr-3 sm:pr-4 flex-shrink-0">
              <PinAttributeFilter
                filters={attributeFilters}
                onChange={setAttributeFilters}
                matchCount={filteredByAttributes.length}
              />
            </div>
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="flex flex-row gap-2 sm:gap-4 lg:gap-6 flex-1 h-full min-h-[600px] sm:min-h-[650px]">
          {/* 現場一覧メニュー 開閉トグルボタン。詳細パネル/検索結果パネルが
              表示されている間は現場一覧自体を出さないため非表示にする。 */}
          {!showDetailPanel && !searchMarker && (
            <button
              type="button"
              onClick={() => setIsDispatchListOpen((prev) => !prev)}
              className="flex-shrink-0 w-8 h-full flex flex-col items-center justify-center gap-1 bg-white border border-gray-200 rounded-lg sm:rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
              aria-expanded={isDispatchListOpen}
              aria-label={isDispatchListOpen ? "現場一覧を閉じる" : "現場一覧を開く"}
              title={isDispatchListOpen ? "現場一覧を閉じる" : "現場一覧を開く"}
            >
              <span className="text-lg leading-none text-gray-600">
                {isDispatchListOpen ? "−" : "＋"}
              </span>
              <span className="text-[9px] text-gray-500 [writing-mode:vertical-rl]">現場一覧</span>
            </button>
          )}

          {showDetailPanel && selectedPin && (
            <div className="flex-1 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-sm min-h-48">
              <div className="w-full">
                <PinDetail
                  pin={selectedPin}
                  onClose={handleCloseSidePanel}
                  onDeleted={handlePinDeleted}
                />
              </div>
            </div>
          )}

          {searchMarker && !selectedPin && (
            <div className="flex-1 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-sm min-h-48">
              <div className="w-full">
                <SearchLocationPanel
                  label={searchMarker.label}
                  address={searchMarker.address}
                  lat={searchMarker.lat}
                  lng={searchMarker.lng}
                  onClose={handleCloseSidePanel}
                  roadSuggestions={roadSuggestions}
                  loadingRoads={loadingRoads}
                  stopSuggestions={stopSuggestions}
                  loadingStops={loadingStops}
                  onHoverRoad={setHoveredRoadKey}
                />
              </div>
            </div>
          )}

          {!showDetailPanel && !searchMarker && isDispatchListOpen && (
            <aside className="w-1/4 md:w-72 h-full overflow-y-auto bg-white border border-gray-200 rounded-lg sm:rounded-xl shadow-sm min-h-[600px] sm:min-h-[650px] flex-shrink-0">
              <div className="sticky top-0 bg-white border-b border-gray-100 px-2 md:px-3 py-2 md:py-2.5 z-10">
                <h2 className="text-[10px] md:text-xs font-semibold text-gray-900 flex items-center gap-1 truncate">
                  📍 <span className="truncate">現場一覧</span>
                </h2>
              </div>
              <GroupedPinList
                pins={filteredByLocation}
                onSelectPin={handleSelectPin}
                onOpenDetail={handleOpenPinDetail}
                selectedPinId={selectedPin?.id ?? null}
                loading={loading}
              />
            </aside>
          )}

          <main className="flex-1 h-full w-full relative rounded-lg sm:rounded-xl overflow-hidden border border-gray-200 shadow-sm min-h-[600px] sm:min-h-[650px]">
            <Map
              pins={filteredByLocation}
              flyTo={flyTo}
              searchMarker={searchMarker}
              onSelectPin={handleSelectPin}
              selectedPin={selectedPin}
              showDetailPanel={showDetailPanel}
              roadSuggestions={searchMarker ? roadSuggestions : []}
              stopSuggestions={searchMarker ? stopSuggestions : []}
              hoveredRoadKey={hoveredRoadKey}
              incidents={incidents}
              breakingAlerts={breakingAlerts}
              userLocation={gpsTracking || tempLocationVisible ? userLocation : null}
              lastKnownLocation={userLocation}
              crewMembers={crewMembers}
              onLocated={handleLocated}
              dispatchListOpen={isDispatchListOpen}
              myProfile={profile ? { name: profile.name, category: profile.category, phone: profile.phone } : null}
              myStatus={myStatus}
              selfLocationHistory={myPathHistory}
              selfUid={profile?.uid ?? null}
              fieldNotes={fieldNotes}
              onCreateFieldNote={handleCreateFieldNote}
              onResolveFieldNote={handleResolveFieldNote}
            />
          </main>
        </div>
      </div>

      {/* ========== MOBILE LAYOUT (<md) ========== */}
      <div className="md:hidden flex flex-col h-[100dvh] w-full max-w-[100vw] fixed inset-0">
        {/* Header - Fixed height at top */}
        {/* overflow指定はあえて付けない: overflow-x-hidden + overflow-y-visible の
            ように片方だけvisibleと組み合わせると、CSS仕様上visibleが自動的に
            autoへ格上げされ、結局h-14の高さでユーザーステータスパネルの
            ドロップダウンが縦方向にクリップされてしまう(要修正バグの原因)。
            横方向の折り返し対策はHeaderNav側の内側コンテナで完結させているため、
            ここではoverflowを完全にデフォルト(visible)のままにする。 */}
        {/* min-h-14(h-14固定ではなく): globals.cssでheader要素全般に
            safe-area分のpadding-topが加わるため、高さを固定するとその分
            中身(HeaderNav)が縦方向に圧縮されてしまう。min-heightにすることで
            padding分だけ外側に高さが伸び、中身の見た目はそのまま保たれる。 */}
        <header className="relative w-full max-w-full shrink-0 min-h-14 px-3 box-border flex items-center justify-between bg-slate-900 text-white border-b border-slate-700 z-[9999]">
          <HeaderNav
            profile={profile}
            onLogout={handleLogout}
            onToggleMenu={() => setMenuOpen(!menuOpen)}
            gpsTracking={gpsTracking}
            gpsAcquiring={gpsAcquiring}
            onToggleGpsTracking={handleToggleGpsTracking}
            onNewSiteRecord={() => setShowSiteRecordForm(true)}
          />
        </header>

        {/* Search Bar - Below speed banner */}
        <div className="shrink-0 w-full bg-white border-b border-gray-100 z-20 box-border flex items-center">
          <div className="flex-1 min-w-0">
            <SearchBar
              onSearch={setQuery}
              onSubmit={handleSubmit}
              loading={geocoding}
              onClear={() => {
                setSearchMarker(null);
                setSelectedPin(null);
                setRoadSuggestions([]);
                setStopSuggestions([]);
                setGeocodeError("");
              }}
            />
            {geocodeError && (
              <p className="px-3 pb-2 text-xs text-red-600">{geocodeError}</p>
            )}
          </div>
          <div className="pr-3 flex-shrink-0">
            <PinAttributeFilter
              filters={attributeFilters}
              onChange={setAttributeFilters}
              matchCount={filteredByAttributes.length}
            />
          </div>
        </div>

        {/* Quick Location Filter - Below search bar */}
        <QuickLocationFilter
          pins={filteredByAttributes}
          selectedFilter={selectedLocationFilter}
          onFilterChange={(location) => {
            setSelectedLocationFilter(location);
            setSelectedPin(null);
            setSearchMarker(null);
          }}
        />

        {/* Map Container - Takes remaining space */}
        <main
          className="flex-1 h-full w-full relative overflow-hidden z-10"
          style={{ touchAction: "manipulation", maxWidth: "100vw", boxSizing: "border-box" }}
        >
          {/* Map */}
          <Map
            pins={filteredByLocation}
            flyTo={flyTo}
            searchMarker={searchMarker}
            onSelectPin={handleSelectPin}
            selectedPin={selectedPin}
            roadSuggestions={searchMarker ? roadSuggestions : []}
            stopSuggestions={searchMarker ? stopSuggestions : []}
            hoveredRoadKey={hoveredRoadKey}
            incidents={incidents}
            breakingAlerts={breakingAlerts}
            userLocation={gpsTracking || tempLocationVisible ? userLocation : null}
            lastKnownLocation={userLocation}
            crewMembers={crewMembers}
            onLocated={handleLocated}
            myProfile={profile ? { name: profile.name, category: profile.category, phone: profile.phone } : null}
            myStatus={myStatus}
            selfLocationHistory={myPathHistory}
            selfUid={profile?.uid ?? null}
            fieldNotes={fieldNotes}
            onCreateFieldNote={handleCreateFieldNote}
            onResolveFieldNote={handleResolveFieldNote}
          />
        </main>

        {/* Mobile Bottom Sheet - Site List (peek/half/full states)
            詳細パネルが開くまでは表示し続ける(!showDetailPanel)。
            こうすることで、現場アイテムを選択した直後(詳細はまだ開かない)も
            一覧が表示されたままとなり、選択中アイテム横の「開く」ボタンを
            ユーザーが視認・タップできる。 */}
        {!showDetailPanel && !searchMarker && (
          <BottomSheet
            isOpen={true}
            onClose={() => {}}
            isPeekable={true}
            peekHeight={64}
            onStateChange={(state) => {
              // Handle state changes if needed
            }}
          >
            {/* Site List - Grouped by parentLocation */}
            <GroupedPinList
              pins={filteredByLocation}
              onSelectPin={handleSelectPin}
              onOpenDetail={handleOpenPinDetail}
              selectedPinId={selectedPin?.id ?? null}
              loading={loading}
            />
          </BottomSheet>
        )}

        {/* Mobile Bottom Sheet - Pin Details */}
        {showDetailPanel && selectedPin && (
          <BottomSheet
            isOpen={showDetailPanel && selectedPin !== null}
            onClose={handleCloseSidePanel}
            title={selectedPin.name}
            isPeekable={false}
          >
            <PinDetail pin={selectedPin} onDeleted={handlePinDeleted} />
          </BottomSheet>
        )}

        {/* Mobile Bottom Sheet - Search Location Details */}
        {searchMarker && !selectedPin && (
          <BottomSheet
            isOpen={searchMarker !== null}
            onClose={handleCloseSidePanel}
            title={searchMarker.label}
            isPeekable={false}
          >
            <SearchLocationPanel
              label={searchMarker.label}
              address={searchMarker.address}
              lat={searchMarker.lat}
              lng={searchMarker.lng}
              onClose={handleCloseSidePanel}
              roadSuggestions={roadSuggestions}
              loadingRoads={loadingRoads}
              stopSuggestions={stopSuggestions}
              loadingStops={loadingStops}
              onHoverRoad={setHoveredRoadKey}
            />
          </BottomSheet>
        )}
      </div>

      {/* Mobile Menu Portal - document.body 直下にレンダリング */}
      {mounted && (
        <MobileMenuPortal
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          profile={profile}
          onLogout={handleLogout}
        />
      )}

      {/* ＋現場記録 - SuperScout風の新規現場記録モーダル(PC・モバイル共通) */}
      {showSiteRecordForm && (
        <SiteRecordForm
          submitting={creatingSiteRecord}
          error={siteRecordError}
          onSubmit={handleCreateSiteRecord}
          onClose={() => {
            setShowSiteRecordForm(false);
            setSiteRecordError("");
          }}
        />
      )}
    </div>
  );
}
