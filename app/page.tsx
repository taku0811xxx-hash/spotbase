"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAllPins, searchPins, type Pin } from "@/lib/pins";
import { useAuth } from "@/components/AuthProvider";
import { logout } from "@/lib/auth";
import { geocodeQuery } from "@/lib/geocode";
import { findWideRoadsNear, findStoppableRoadsNear, type RoadSuggestion } from "@/lib/roads";
import SearchBar from "@/components/SearchBar";
import PinSidePanel from "@/components/PinSidePanel";
import SearchLocationPanel from "@/components/SearchLocationPanel";
import Logo from "@/components/Logo";

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

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (!profile) return; // プロフィール未整備(管理者にアカウント設定を確認してもらう)
    getAllPins({
      organizationId: profile.organizationId,
      category: profile.category,
      isAdmin: profile.accessLevel === "admin",
    })
      .then(setPins)
      .finally(() => setLoading(false));
  }, [authLoading, user, profile, router]);

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  const filtered = searchPins(pins, query);

  // 検索結果(登録済みピン)が1件に絞られたら、その場所へ地図を自動的に移動する
  useEffect(() => {
    if (query.trim() && filtered.length === 1) {
      setFlyTo({ lat: filtered[0].lat, lng: filtered[0].lng });
      setSearchMarker(null);
    }
  }, [query, filtered]);

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
    setFlyTo({ lat: pin.lat, lng: pin.lng });
    loadLocationInsights(pin.lat, pin.lng);
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
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex-shrink-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 bg-gray-900 text-white">
            <Logo className="text-white" />
            <div className="flex items-center gap-3">
              {profile && (
                <div className="hidden sm:block text-right text-xs text-gray-300 leading-tight mr-1">
                  <p>{profile.organizationName} / {profile.category}</p>
                  <p className="text-gray-400">{profile.name}{profile.accessLevel === "admin" && "(管理者)"}</p>
                </div>
              )}
              {profile?.accessLevel === "admin" && (
                <Link
                  href="/admin/users"
                  className="text-white text-sm font-medium rounded-lg px-3 py-2 border border-gray-600 hover:bg-gray-800 transition-all duration-150"
                >
                  ユーザー管理
                </Link>
              )}
              <Link
                href="/dispatch/new"
                className="text-white text-sm font-medium rounded-lg px-4 py-2 bg-red-600 shadow-sm hover:bg-red-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150"
              >
                + 出動記録
              </Link>
              <button
                onClick={handleLogout}
                className="text-gray-300 text-sm rounded-lg px-3 py-2 hover:bg-gray-800 hover:text-white transition-all duration-150"
              >
                ログアウト
              </button>
            </div>
          </div>
          <div className="border-t border-gray-100">
            <SearchBar onSearch={setQuery} onSubmit={handleSubmit} loading={geocoding} />
            {geocodeError && (
              <p className="px-4 sm:px-5 pb-3 text-xs text-red-600">{geocodeError}</p>
            )}
          </div>
        </div>

        <div className="flex-1 flex gap-4 sm:gap-6 overflow-hidden">
          {selectedPin ? (
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
          ) : searchMarker ? (
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
          ) : (
            <aside className="flex-1 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-sm hidden sm:block">
              {loading && <p className="p-3 text-sm text-gray-500">読み込み中...</p>}
              {!loading && filtered.length === 0 && (
                <p className="p-3 text-sm text-gray-500">該当する現場がありません</p>
              )}
              <ul>
                {filtered.map((pin) => (
                  <li key={pin.id} className="border-b border-gray-100 last:border-0">
                    <button
                      onClick={() => handleSelectPin(pin)}
                      className="w-full text-left p-3 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <p className="font-medium text-gray-900">{pin.name}</p>
                      <p className="text-xs text-gray-500">{pin.address}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          )}

          <main className="aspect-square h-full flex-shrink-0 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
            <Map
              pins={filtered}
              flyTo={flyTo}
              searchMarker={searchMarker}
              onSelectPin={handleSelectPin}
              roadSuggestions={selectedPin || searchMarker ? roadSuggestions : []}
              stopSuggestions={selectedPin || searchMarker ? stopSuggestions : []}
              hoveredRoadKey={hoveredRoadKey}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
