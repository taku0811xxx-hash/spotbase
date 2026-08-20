"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAllPins, searchPins, type Pin } from "@/lib/pins";
import { getHighUrgencyIncidents, type Incident } from "@/lib/incidents";
import { generateTestIncidents } from "@/lib/incidentsTest";
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

// LeafletはSSR非対応なのでクライアント側のみで読み込む
const Map = dynamic(() => import("@/components/Map"), { ssr: false });

type SearchMarker = { lat: number; lng: number; label: string; address: string };

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
    ])
      .then((results) => {
        const pinsResult = results[0];
        const incidentsResult = results[1];

        const pinsData =
          pinsResult.status === "fulfilled" ? pinsResult.value : [];

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

        setPins(pinsData);
        setIncidents(incidentsData);
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

  const filtered = searchPins(pins, query);

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
    <div className="h-screen flex flex-col bg-gray-100">
      <div className="flex flex-col flex-1 max-w-6xl w-full mx-auto p-6 sm:p-10 gap-4 sm:gap-6 overflow-hidden">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex-shrink-0">
          <HeaderNav
            profile={profile}
            onLogout={handleLogout}
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
              <p className="px-4 sm:px-5 pb-3 text-xs text-red-600">{geocodeError}</p>
            )}
          </div>
        </div>

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

        {/* レイアウト: モバイル時は flex-row で 1/4 と 3/4 の分割、デスクトップ時も flex-row を継続 */}
        <div className="flex-1 flex flex-row gap-2 sm:gap-4 lg:gap-6 overflow-hidden">
          {/* サイドパネル: デスクトップのみ表示、モバイルはボトムシート */}
          {selectedPin && (
            <>
              {/* Desktop side panel */}
              <div className="hidden md:flex flex-1 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-sm min-h-48">
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

              {/* Mobile bottom sheet */}
              <BottomSheet
                isOpen={selectedPin !== null}
                onClose={handleCloseSidePanel}
                title={selectedPin.name}
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
            </>
          )}

          {searchMarker && !selectedPin && (
            <>
              {/* Desktop side panel */}
              <div className="hidden md:flex flex-1 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-sm min-h-48">
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

              {/* Mobile bottom sheet */}
              <BottomSheet
                isOpen={searchMarker !== null}
                onClose={handleCloseSidePanel}
                title={searchMarker.label}
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
            </>
          )}

          {!selectedPin && !searchMarker && (
            <aside className="w-1/4 md:w-72 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-sm min-h-48 flex-shrink-0">
              <div className="sticky top-0 bg-white border-b border-gray-100 px-2 md:px-3 py-2 md:py-2.5 z-10">
                <h2 className="text-[10px] md:text-xs font-semibold text-gray-900 flex items-center gap-1 truncate">
                  📍 <span className="truncate">現場一覧</span>
                </h2>
              </div>
              {loading && <p className="p-2 text-[10px] md:text-xs text-gray-500">読み込み中...</p>}
              {!loading && filtered.length === 0 && (
                <p className="p-2 text-[10px] md:text-xs text-gray-500">該当する現場がありません</p>
              )}
              <ul>
                {filtered.map((pin) => (
                  <li key={pin.id} className="border-b border-gray-100 last:border-0">
                    <button
                      onClick={() => handleSelectPin(pin)}
                      className="w-full text-left p-2 hover:bg-gray-50 rounded-lg transition-colors text-[10px] md:text-xs"
                    >
                      <p className="font-medium text-gray-900 truncate text-[10px] md:text-xs">{pin.name}</p>
                      <p className="text-[9px] md:text-[10px] text-gray-500 truncate">{pin.address}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          )}

          <main className="flex-1 rounded-xl overflow-hidden border border-gray-200 shadow-sm min-h-48">
            <Map
              pins={filtered}
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
    </div>
  );
}
