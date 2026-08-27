"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAllPins, searchPins, createQuickPin, type Pin } from "@/lib/pins";
import { getHighUrgencyIncidents, type Incident } from "@/lib/incidents";
import { getDispatchRecords, createQuickDispatchRecord } from "@/lib/dispatchRecords";
import type { BreakingAlert } from "@/lib/breaking/parseLocation";
import { useBreakingAlerts } from "@/lib/hooks/useBreakingAlerts";
import { useAuth } from "@/components/AuthProvider";
import { logout } from "@/lib/auth";
import { geocodeQuery } from "@/lib/geocode";
import { findWideRoadsNear, findStoppableRoadsNear, type RoadSuggestion } from "@/lib/roads";
import SearchBar from "@/components/SearchBar";
import PinSidePanel from "@/components/PinSidePanel";
import SearchLocationPanel from "@/components/SearchLocationPanel";
import Logo from "@/components/Logo";
import HeaderNav from "@/components/HeaderNav";
import IncidentAlert from "@/components/IncidentAlert";
import BottomSheet from "@/components/BottomSheet";
import MobileMenuPortal from "@/components/MobileMenuPortal";
import QuickLocationFilter from "@/components/QuickLocationFilter";
import GroupedPinList from "@/components/GroupedPinList";
import NewDispatchModal from "@/components/NewDispatchModal";

// LeafletはSSR非対応なのでクライアント側のみで読み込む
const Map = dynamic(() => import("@/components/Map"), { ssr: false });

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
  const { user, profile, loading: authLoading } = useAuth();
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
  const [activeDispatchCount, setActiveDispatchCount] = useState(0);
  const [showSiteList, setShowSiteList] = useState(true); // For mobile bottom sheet

  // メニュー開閉状態管理
  const [menuOpen, setMenuOpen] = useState(false);

  // 「新規出動」クイックフロー用の状態
  const [showNewDispatchModal, setShowNewDispatchModal] = useState(false);
  const [creatingDispatch, setCreatingDispatch] = useState(false);
  const [newSiteError, setNewSiteError] = useState("");

  // グループ化フィルター選択状態
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<string | null>(null);

  // ハイドレーション完了フラグ（Portal用途のみ）
  const [mounted, setMounted] = useState(false);

  // 現在地(GPS)。地図中心とユーザーピンに反映する。
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  // 出動中(ON)/待機中(OFF)のGPS追跡状態。localStorageで再読み込み後も保持する。
  // 初期値はfalse固定(SSR/クライアントのハイドレーション不一致を避けるため)にし、
  // マウント後のuseEffectでlocalStorageの値を反映する。
  const [gpsTracking, setGpsTracking] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  // GPS追跡をONにした直後の1回目の位置取得でのみ地図を現在地へ移動させるためのフラグ
  // (以降の継続更新のたびに地図が動いてしまうと操作の邪魔になるため)
  const hasCenteredOnGpsRef = useRef(false);

  const GPS_TRACKING_STORAGE_KEY = "spotbase.gpsTrackingEnabled";
  // 東京駅周辺（位置情報が拒否/取得失敗した場合のフォールバック座標）
  const DEFAULT_LOCATION = { lat: 35.681236, lng: 139.767125 };

  useEffect(() => {
    // ハイドレーション完了を示す
    setMounted(true);
    // 前回のGPS追跡ON/OFF状態をlocalStorageから復元
    try {
      const stored = window.localStorage.getItem(GPS_TRACKING_STORAGE_KEY);
      if (stored === "true") {
        setGpsTracking(true);
      }
    } catch (error) {
      console.warn("GPS追跡状態の読み込みに失敗しました:", error);
    }
  }, []);

  // ステータスボタンから呼ばれるON/OFF切り替えハンドラ。状態をlocalStorageへ即時保存する。
  function handleToggleGpsTracking() {
    setGpsTracking((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(GPS_TRACKING_STORAGE_KEY, String(next));
      } catch (error) {
        console.warn("GPS追跡状態の保存に失敗しました:", error);
      }
      return next;
    });
  }

  useEffect(() => {
    // ログイン(認証完了)前は何もしない
    if (authLoading || !user || !profile) return;

    // 待機中(OFF): 実行中の追跡があれば停止してバッテリー消費を抑える
    if (!gpsTracking) {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    // 出動中(ON): 現在地の継続追跡を開始
    hasCenteredOnGpsRef.current = false;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setUserLocation(DEFAULT_LOCATION);
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUserLocation(loc);
        // 地図が動いて操作の邪魔にならないよう、ONにした直後の初回のみ中心移動する
        if (!hasCenteredOnGpsRef.current) {
          setFlyTo(loc);
          hasCenteredOnGpsRef.current = true;
        }
      },
      (error) => {
        // 拒否・取得失敗時は安全にデフォルト座標へフォールバック
        console.warn("現在地の取得に失敗しました。デフォルト座標を使用します:", error);
        setUserLocation(DEFAULT_LOCATION);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
    watchIdRef.current = id;

    return () => {
      navigator.geolocation.clearWatch(id);
      watchIdRef.current = null;
    };
  }, [authLoading, user, profile, gpsTracking]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (!profile) return; // プロフィール未整備(管理者にアカウント設定を確認してもらう)

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

        // Calculate active dispatch count
        const activeCount = dispatchRecords.filter(
          (r) => r.status && r.status !== "完了"
        ).length;

        setPins(pinsData);
        setIncidents(incidentsData);
        // breakingAlerts はクライアント側の useBreakingAlerts フックで自動管理
        setActiveDispatchCount(activeCount);
      })
      .catch((error) => {
        console.error("Unexpected error loading data:", error);
        setLoading(false);
      })
      .finally(() => setLoading(false));
  }, [authLoading, user, profile, router]);

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  // 「新規出動」モーダルで現場を選択した時の処理。
  // 詳細フォームの入力を待たず、即座に「出動中」状態の記録を作成して
  // GPS+チャットのライブ画面へ遷移する。
  async function handleQuickDispatch(pin: Pin) {
    if (!profile || creatingDispatch) return;
    setCreatingDispatch(true);
    setNewSiteError("");
    try {
      const recordId = await createQuickDispatchRecord({
        locationName: pin.name,
        address: pin.address,
        lat: pin.lat,
        lng: pin.lng,
        organizationId: profile.organizationId,
        category: profile.category,
        recordedBy: profile.name,
      });
      setShowNewDispatchModal(false);
      router.push(`/dispatch/${recordId}/live`);
    } catch (error) {
      console.error("新規出動の作成に失敗しました:", error);
    } finally {
      setCreatingDispatch(false);
    }
  }

  // 「新規出動」モーダルで、既存の現場に該当がない場合の新規現場登録+出動開始処理。
  // 入力された住所/建物名を地名検索(geocode)して座標を取得し、
  // 現場(ピン)と出動記録の両方をその場で作成する。
  async function handleQuickDispatchNewSite({
    name,
    addressQuery,
  }: {
    name: string;
    addressQuery: string;
  }) {
    if (!profile || creatingDispatch) return;
    setCreatingDispatch(true);
    setNewSiteError("");
    try {
      const results = await geocodeQuery(addressQuery);
      if (results.length === 0) {
        setNewSiteError("入力した住所/建物名から位置情報を取得できませんでした。表記を変えて再度お試しください。");
        return;
      }
      const top = results[0];

      const pinId = await createQuickPin({
        name,
        address: top.displayName,
        lat: top.lat,
        lng: top.lng,
        organizationId: profile.organizationId,
        category: profile.category,
        recordedBy: profile.name,
      });

      const recordId = await createQuickDispatchRecord({
        locationName: name,
        address: top.displayName,
        lat: top.lat,
        lng: top.lng,
        organizationId: profile.organizationId,
        category: profile.category,
        recordedBy: profile.name,
      });

      // 新しく登録した現場を一覧にも即座に反映
      setPins((prev) => [
        {
          id: pinId,
          name,
          address: top.displayName,
          lat: top.lat,
          lng: top.lng,
          parkingInfo: "",
          shootingSpots: "",
          ipTransmissionInfo: "",
          fpuInfo: "",
          hazards: "",
          photoUrls: [],
          shootingPhotoUrls: [],
          hazardPhotoUrls: [],
          organizationId: profile.organizationId,
          category: profile.category,
          recordedBy: profile.name,
          recordedAt: null,
        },
        ...prev,
      ]);

      setShowNewDispatchModal(false);
      router.push(`/dispatch/${recordId}/live`);
    } catch (error) {
      console.error("新規現場の登録に失敗しました:", error);
      setNewSiteError("新規現場の登録に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setCreatingDispatch(false);
    }
  }

  // 検索結果のメモ化 - 検索クエリまたはピン配列が変更された場合のみ再計算
  const filtered = useMemo(() => searchPins(pins, query), [pins, query]);

  // ロケーションフィルター適用 - parentLocation が選択されている場合のみフィルタリング
  const filteredByLocation = useMemo(() => {
    if (!selectedLocationFilter) return filtered;
    return filtered.filter((pin) =>
      getParentLocation(pin) === selectedLocationFilter
    );
  }, [filtered, selectedLocationFilter]);

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
      loadLocationInsights(pin.lat, pin.lng);
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

  function handleReturnToPin() {
    // 選択中のピンが存在する場合、その座標へ地図を移動
    if (selectedPin && selectedPin.lat && selectedPin.lng) {
      setFlyTo({ lat: selectedPin.lat, lng: selectedPin.lng });
    }
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

  return (
    <div className="w-full max-w-full overflow-x-hidden flex flex-col bg-gray-100 min-h-screen md:min-h-screen md:h-screen">
      {/* ========== DESKTOP LAYOUT (md+) ========== */}
      <div className="hidden md:flex md:flex-col w-full h-full mx-auto p-4 sm:p-6 gap-2 sm:gap-3">
        <div className="bg-white border border-gray-200 rounded-lg sm:rounded-xl shadow-sm flex-shrink-0">
          <HeaderNav
            profile={profile}
            onLogout={handleLogout}
            activeDispatchCount={activeDispatchCount}
            gpsTracking={gpsTracking}
            onToggleGpsTracking={handleToggleGpsTracking}
            onNewDispatch={() => setShowNewDispatchModal(true)}
          />
          <div className="border-t border-gray-100 relative z-40">
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
        </div>

        {/* Quick Location Filter - Below search bar */}
        <QuickLocationFilter
          pins={filtered}
          selectedFilter={selectedLocationFilter}
          onFilterChange={(location) => {
            setSelectedLocationFilter(location);
            setSelectedPin(null);
            setSearchMarker(null);
          }}
        />

        {/* 速報アラートパネル - 常時表示（データ有無問わず） */}
        <IncidentAlert
          incidents={incidents}
          onMapNavigate={(lat, lng) => {
            setFlyTo({ lat, lng });
            setSearchMarker(null);
            setSelectedPin(null);
          }}
        />

        {/* Desktop Layout */}
        <div className="flex flex-row gap-2 sm:gap-4 lg:gap-6 flex-1 h-full min-h-[600px] sm:min-h-[650px]">
          {showDetailPanel && selectedPin && (
            <div className="flex-1 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-sm min-h-48">
              <div className="w-full">
                <PinSidePanel
                  pin={selectedPin}
                  onClose={handleCloseSidePanel}
                  onDeleted={handlePinDeleted}
                  onReturnToPin={handleReturnToPin}
                  roadSuggestions={roadSuggestions}
                  loadingRoads={loadingRoads}
                  stopSuggestions={stopSuggestions}
                  loadingStops={loadingStops}
                  onHoverRoad={setHoveredRoadKey}
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

          {!showDetailPanel && !searchMarker && (
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
              roadSuggestions={selectedPin || searchMarker ? roadSuggestions : []}
              stopSuggestions={selectedPin || searchMarker ? stopSuggestions : []}
              hoveredRoadKey={hoveredRoadKey}
              incidents={incidents}
              breakingAlerts={breakingAlerts}
              userLocation={userLocation}
            />
          </main>
        </div>
      </div>

      {/* ========== MOBILE LAYOUT (<md) ========== */}
      <div className="md:hidden flex flex-col h-[100dvh] w-full max-w-[100vw] fixed inset-0">
        {/* Header - Fixed height at top */}
        <header className="w-full max-w-full shrink-0 h-14 px-3 box-border flex items-center justify-between overflow-hidden bg-slate-900 text-white border-b border-slate-700 z-50">
          <HeaderNav
            profile={profile}
            onLogout={handleLogout}
            activeDispatchCount={activeDispatchCount}
            onToggleMenu={() => setMenuOpen(!menuOpen)}
            gpsTracking={gpsTracking}
            onToggleGpsTracking={handleToggleGpsTracking}
            onNewDispatch={() => setShowNewDispatchModal(true)}
          />
        </header>

        {/* Speed Banner - Horizontal scrollable banner below header - 常時表示（データ有無問わず） */}
        <div className="shrink-0 w-full max-w-full overflow-x-auto bg-red-50 border-b border-red-200 z-30 py-1.5 px-2 box-border">
          <div className="whitespace-nowrap">
            <IncidentAlert
              incidents={incidents}
              onMapNavigate={(lat, lng) => {
                setFlyTo({ lat, lng });
                setSearchMarker(null);
                setSelectedPin(null);
              }}
            />
          </div>
        </div>

        {/* Search Bar - Below speed banner */}
        <div className="shrink-0 w-full bg-white border-b border-gray-100 z-20 box-border">
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

        {/* Quick Location Filter - Below search bar */}
        <QuickLocationFilter
          pins={filtered}
          selectedFilter={selectedLocationFilter}
          onFilterChange={(location) => {
            setSelectedLocationFilter(location);
            setSelectedPin(null);
            setSearchMarker(null);
          }}
        />

        {/* Map Container - Takes remaining space */}
        <main className="flex-1 h-full w-full relative overflow-hidden z-10" style={{ touchAction: "manipulation" }}>
          {/* Map */}
          <Map
            pins={filteredByLocation}
            flyTo={flyTo}
            searchMarker={searchMarker}
            onSelectPin={handleSelectPin}
            selectedPin={selectedPin}
            roadSuggestions={selectedPin || searchMarker ? roadSuggestions : []}
            stopSuggestions={selectedPin || searchMarker ? stopSuggestions : []}
            hoveredRoadKey={hoveredRoadKey}
            incidents={incidents}
            breakingAlerts={breakingAlerts}
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
            <PinSidePanel
              pin={selectedPin}
              onClose={handleCloseSidePanel}
              onDeleted={handlePinDeleted}
              onReturnToPin={handleReturnToPin}
              roadSuggestions={roadSuggestions}
              loadingRoads={loadingRoads}
              stopSuggestions={stopSuggestions}
              loadingStops={loadingStops}
              onHoverRoad={setHoveredRoadKey}
            />
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

      {/* 新規出動 - 現場選択・新規現場登録モーダル(PC・モバイル共通) */}
      <NewDispatchModal
        isOpen={showNewDispatchModal}
        onClose={() => {
          setShowNewDispatchModal(false);
          setNewSiteError("");
        }}
        pins={pins}
        onSelect={handleQuickDispatch}
        onCreateNewSite={handleQuickDispatchNewSite}
        submitting={creatingDispatch}
        errorMessage={newSiteError}
      />
    </div>
  );
}
