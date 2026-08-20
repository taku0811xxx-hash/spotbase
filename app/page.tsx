"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAllPins, searchPins, type Pin } from "@/lib/pins";
import { getHighUrgencyIncidents, type Incident } from "@/lib/incidents";
import { generateTestIncidents } from "@/lib/incidentsTest";
import { getDispatchRecords } from "@/lib/dispatchRecords";
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
  const [roadSuggestions, setRoadSuggestions] = useState<RoadSuggestion[]>([]);
  const [loadingRoads, setLoadingRoads] = useState(false);
  const [stopSuggestions, setStopSuggestions] = useState<RoadSuggestion[]>([]);
  const [loadingStops, setLoadingStops] = useState(false);
  const [hoveredRoadKey, setHoveredRoadKey] = useState<string | null>(null);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [activeDispatchCount, setActiveDispatchCount] = useState(0);
  const [showSiteList, setShowSiteList] = useState(true); // For mobile bottom sheet

  // メニュー開閉状態管理
  const [menuOpen, setMenuOpen] = useState(false);

  // グループ化フィルター選択状態
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<string | null>(null);

  // ハイドレーション完了フラグ（Portal用途のみ）
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // ハイドレーション完了を示す
    setMounted(true);
  }, []);

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
        } else {
          console.warn(
            "Failed to load incidents from Firestore (likely due to security rules):",
            incidentsResult.reason
          );
          console.info("Using test data for demonstration...");
          // Firestore ルール未設定時はテストデータを使用
          incidentsData = generateTestIncidents(profile.organizationId);
        }

        // Calculate active dispatch count
        const activeCount = dispatchRecords.filter(
          (r) => r.status && r.status !== "完了"
        ).length;

        setPins(pinsData);
        setIncidents(incidentsData);
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

  // 指定した地点の「駐車候補」「駐停車候補」をまとめて検索する
  async function loadLocationInsights(lat: number, lng: number) {
    setRoadSuggestions([]);
    setStopSuggestions([]);
    setLoadingRoads(true);
    setLoadingStops(true);
    findWideRoadsNear(lat, lng)
      .then(setRoadSuggestions)
      .catch((err) => console.error(err))
      .finally(() => setLoadingRoads(false));
    findStoppableRoadsNear(lat, lng)
      .then(setStopSuggestions)
      .catch((err) => console.error(err))
      .finally(() => setLoadingStops(false));
  }

  // 現場ピンを選択したら、詳細パネルを開き、周辺情報を検索する
  function handleSelectPin(pin: Pin) {
    setSelectedPin(pin);
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

  function handleCloseSidePanel() {
    setSelectedPin(null);
    setSearchMarker(null);
    setRoadSuggestions([]);
    setStopSuggestions([]);
  }

  function handlePinDeleted() {
    if (!selectedPin) return;
    setPins((prev) => prev.filter((p) => p.id !== selectedPin.id));
    handleCloseSidePanel();
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

        {/* 速報アラートパネル */}
        {incidents.length > 0 && (
          <IncidentAlert
            incidents={incidents}
            onMapNavigate={(lat, lng) => {
              setFlyTo({ lat, lng });
              setSearchMarker(null);
              setSelectedPin(null);
            }}
          />
        )}

        {/* Desktop Layout */}
        <div className="flex flex-row gap-2 sm:gap-4 lg:gap-6 flex-1 h-full min-h-[600px] sm:min-h-[650px]">
          {selectedPin && (
            <div className="flex-1 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-sm min-h-48">
              <div className="w-full">
                <PinSidePanel
                  pin={selectedPin}
                  onClose={handleCloseSidePanel}
                  onDeleted={handlePinDeleted}
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

          {!selectedPin && !searchMarker && (
            <aside className="w-1/4 md:w-72 h-full overflow-y-auto bg-white border border-gray-200 rounded-lg sm:rounded-xl shadow-sm min-h-[600px] sm:min-h-[650px] flex-shrink-0">
              <div className="sticky top-0 bg-white border-b border-gray-100 px-2 md:px-3 py-2 md:py-2.5 z-10">
                <h2 className="text-[10px] md:text-xs font-semibold text-gray-900 flex items-center gap-1 truncate">
                  📍 <span className="truncate">現場一覧</span>
                </h2>
              </div>
              <GroupedPinList
                pins={filteredByLocation}
                onSelectPin={handleSelectPin}
                loading={loading}
              />
            </aside>
          )}

          <main className="flex-1 h-full w-full rounded-lg sm:rounded-xl overflow-hidden border border-gray-200 shadow-sm min-h-[600px] sm:min-h-[650px]">
            <Map
              pins={filteredByLocation}
              flyTo={flyTo}
              searchMarker={searchMarker}
              onSelectPin={handleSelectPin}
              roadSuggestions={selectedPin || searchMarker ? roadSuggestions : []}
              stopSuggestions={selectedPin || searchMarker ? stopSuggestions : []}
              hoveredRoadKey={hoveredRoadKey}
              incidents={incidents}
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
          />
        </header>

        {/* Speed Banner - Horizontal scrollable banner below header */}
        {incidents.length > 0 && (
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
        )}

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
            roadSuggestions={selectedPin || searchMarker ? roadSuggestions : []}
            stopSuggestions={selectedPin || searchMarker ? stopSuggestions : []}
            hoveredRoadKey={hoveredRoadKey}
            incidents={incidents}
          />
        </main>

        {/* Mobile Bottom Sheet - Site List (peek/half/full states) */}
        {!selectedPin && !searchMarker && (
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
              loading={loading}
            />
          </BottomSheet>
        )}

        {/* Mobile Bottom Sheet - Pin Details */}
        {selectedPin && (
          <BottomSheet
            isOpen={selectedPin !== null}
            onClose={handleCloseSidePanel}
            title={selectedPin.name}
            isPeekable={false}
          >
            <PinSidePanel
              pin={selectedPin}
              onClose={handleCloseSidePanel}
              onDeleted={handlePinDeleted}
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
    </div>
  );
}
