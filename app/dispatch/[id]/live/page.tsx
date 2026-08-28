"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import {
  addChatMessage,
  toggleChatReaction,
  updateDispatchTitleSummary,
  completeDispatchRecord,
  type DispatchRecord,
  type ChatMessage,
} from "@/lib/dispatchRecords";
import { geocodeQuery, type GeocodeResult } from "@/lib/geocode";
import PageHeader from "@/components/PageHeader";

// LeafletはSSR非対応なのでクライアント側のみで読み込む
const LiveDispatchMap = dynamic(() => import("@/components/LiveDispatchMap"), { ssr: false });

// 東京駅周辺（位置情報が拒否/取得失敗した場合のフォールバック座標）
const DEFAULT_LOCATION = { lat: 35.681236, lng: 139.767125 };

// ワンタップで送れるクイックリアクション
const QUICK_REACTIONS = ["了解", "👍", "🙏"];

// 発言者名から一貫した色を割り当てる(Teams風のアバター用)。
// 同じ人は常に同じ色になるよう、名前の文字コード合計でパレットを選ぶ。
const AVATAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500",
  "bg-violet-500", "bg-cyan-600", "bg-orange-500", "bg-teal-500",
];
function avatarColorFor(name: string): string {
  const sum = Array.from(name).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}
function avatarInitial(name: string): string {
  return (name.trim()[0] || "?").toUpperCase();
}

export default function LiveDispatchPage() {
  const params = useParams();
  const router = useRouter();
  const recordId = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
  const { user, profile, loading: authLoading } = useAuth();

  const [record, setRecord] = useState<DispatchRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  // GPS取得状況: acquiring=測位中 / active=取得中 / denied=権限拒否 / unavailable=測位不可
  const [gpsStatus, setGpsStatus] = useState<"acquiring" | "active" | "denied" | "unavailable">("acquiring");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  // 高精度測位用と、そのフォールバック(標準精度)用のwatchIdを別々に保持する
  const highAccuracyWatchIdRef = useRef<number | null>(null);
  const standardAccuracyWatchIdRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gotFirstFixRef = useRef(false);
  // 権限拒否と判明した後は標準精度側へのフォールバックも試みない(再試行しても
  // 無駄なため)。setState(gpsStatus)はクロージャ内で古い値を参照してしまうので
  // refで即座に確認できるようにする。
  const permissionDeniedRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // タイトル・概要・住所・出動内容・出動者・現場管理者・関連ニュース(出動中画面での編集用)
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [address, setAddress] = useState("");
  const [incidentType, setIncidentType] = useState("");
  const [dispatcherName, setDispatcherName] = useState("");
  const [siteManagerName, setSiteManagerName] = useState("");
  const [newsUrl, setNewsUrl] = useState("");
  const [newsSummary, setNewsSummary] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

  // 住所の自動補完: 現場名を基にジオコーディングした候補一覧
  const [addressCandidates, setAddressCandidates] = useState<GeocodeResult[]>([]);
  const [addressSearching, setAddressSearching] = useState(false);
  const [addressSearchError, setAddressSearchError] = useState("");

  // 関連ニュースURLからの概要自動抽出
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState("");

  // 出動記録の読み込み + リアルタイム購読。
  // チャットは現場スタッフと局内スタッフの双方が別端末から書き込むため、
  // onSnapshotで他者の更新も即座に画面へ反映する。
  // タイトル・概要は自分が入力中に他者更新で上書きされないよう、初回読み込み時のみ反映する。
  const detailsInitializedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (!recordId) return;

    const unsubscribe = onSnapshot(
      doc(db, "dispatch_records", recordId),
      (snap) => {
        if (!snap.exists()) {
          setRecord(null);
          setLoading(false);
          return;
        }
        const data = { id: snap.id, ...(snap.data() as Omit<DispatchRecord, "id">) };
        setRecord(data);
        setChatMessages(data.chatMessages || []);
        if (!detailsInitializedRef.current) {
          setTitle(data.title || data.locationName || "");
          setSummary(data.summary || "");
          setAddress(data.address || "");
          setIncidentType(data.incidentType || "");
          setDispatcherName(data.dispatcherName || data.recordedBy || "");
          setSiteManagerName(data.siteManagerName || "");
          setNewsUrl(data.newsUrl || "");
          setNewsSummary(data.newsSummary || "");
          detailsInitializedRef.current = true;
        }
        setLoading(false);
      },
      (error) => {
        console.error("出動記録のリアルタイム購読に失敗しました:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [authLoading, user, recordId, router]);

  // 出動中は常時GPSを追跡し、現在地ピンをリアルタイム更新する。画面を離れたら
  // 追跡を止めてバッテリー消費を抑える。
  //
  // 二段階フォールバック方式:
  //   1. まず enableHighAccuracy:true (timeout 6000ms) で高精度測位を試みる
  //   2. タイムアウト・測位不可(POSITION_UNAVAILABLE/TIMEOUT)で失敗した場合は、
  //      自動的に enableHighAccuracy:false (timeout 10000ms、Wi-Fi/IP測位)へ
  //      切り替えて追跡を継続する
  //   3. 権限拒否(PERMISSION_DENIED)の場合は再試行しても無駄なので、その場で
  //      gpsStatusを"denied"にして通知するに留める(例外は投げずconsole.warnのみ)
  useEffect(() => {
    if (authLoading || !user) return;

    // SSR環境やGeolocation非対応端末では即座にフォールバック座標を使う
    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.geolocation
    ) {
      setGpsStatus("unavailable");
      setCurrentLocation(DEFAULT_LOCATION);
      return;
    }

    gotFirstFixRef.current = false;
    permissionDeniedRef.current = false;
    setGpsStatus("acquiring");

    function handleFix(position: GeolocationPosition) {
      gotFirstFixRef.current = true;
      setCurrentLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      setGpsStatus("active");
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    }

    // 標準精度(Wi-Fi/IP測位)での追跡。高精度測位のタイムアウト/測位不可時のフォールバック。
    function startStandardAccuracyWatch() {
      // 既に権限拒否と判明している場合は再試行しても無駄なので何もしない
      if (permissionDeniedRef.current) return;
      if (standardAccuracyWatchIdRef.current !== null) return; // 二重起動を防ぐ
      const id = navigator.geolocation.watchPosition(
        handleFix,
        (error) => {
          console.warn("現在地の取得に失敗しました(標準精度):", error);
          if (error.code === error.PERMISSION_DENIED) {
            permissionDeniedRef.current = true;
            setGpsStatus("denied");
          } else if (!gotFirstFixRef.current) {
            // 両方の試行で一度も測位できていない場合のみ、フォールバック座標を使う
            setGpsStatus("unavailable");
            setCurrentLocation((prev) => prev ?? DEFAULT_LOCATION);
          }
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 5000 }
      );
      standardAccuracyWatchIdRef.current = id;
    }

    const highId = navigator.geolocation.watchPosition(
      handleFix,
      (error) => {
        console.warn("現在地の取得に失敗しました(高精度):", error);
        if (error.code === error.PERMISSION_DENIED) {
          permissionDeniedRef.current = true;
          setGpsStatus("denied");
          return;
        }
        // タイムアウト・測位不可の場合は標準精度(Wi-Fi/IP測位)へフォールバックする
        startStandardAccuracyWatch();
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 5000 }
    );
    highAccuracyWatchIdRef.current = highId;

    // 6.5秒経っても高精度側から一度もfixが得られない場合の保険として、
    // 標準精度の並行追跡を開始する(高精度watchPositionはtimeout到達後もエラー
    // コールバックが発火しない実装のブラウザがあるため、タイマーで確実に補う)。
    // ただし権限拒否と判明済みの場合はここでも再試行しない。
    fallbackTimerRef.current = setTimeout(() => {
      if (!gotFirstFixRef.current && !permissionDeniedRef.current) {
        startStandardAccuracyWatch();
      }
    }, 6500);

    return () => {
      if (highAccuracyWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(highAccuracyWatchIdRef.current);
        highAccuracyWatchIdRef.current = null;
      }
      if (standardAccuracyWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(standardAccuracyWatchIdRef.current);
        standardAccuracyWatchIdRef.current = null;
      }
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };
  }, [authLoading, user]);

  // 新着メッセージが来たら自動で一番下までスクロール
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function handleSendChat() {
    const text = chatInput.trim();
    if (!text || !recordId || sending) return;

    setSending(true);
    // 楽観的更新: 送信結果を待たず先に画面へ反映する
    const optimisticMessage: ChatMessage = {
      id: `pending-${Date.now()}`,
      sender: profile?.name || "不明",
      text,
      timestamp: new Date().toISOString(),
      type: "text",
    };
    setChatMessages((prev) => [...prev, optimisticMessage]);
    setChatInput("");

    try {
      const saved = await addChatMessage(recordId, chatMessages, {
        sender: profile?.name || "不明",
        text,
      });
      setChatMessages((prev) =>
        prev.map((m) => (m.id === optimisticMessage.id ? saved : m))
      );
    } catch (error) {
      console.error("チャット送信に失敗しました:", error);
      // 送信失敗時は楽観的に追加したメッセージを取り消す
      setChatMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id));
      setChatInput(text);
    } finally {
      setSending(false);
    }
  }

  // クイックリアクション(了解 等)をワンタップでトグルする
  async function handleToggleReaction(messageId: string, emoji: string) {
    if (!recordId) return;
    const user = profile?.name || "不明";

    // 楽観的更新
    setChatMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        const reactions = msg.reactions ? [...msg.reactions] : [];
        const idx = reactions.findIndex((r) => r.emoji === emoji);
        if (idx === -1) {
          reactions.push({ emoji, users: [user] });
        } else {
          const users = reactions[idx].users.includes(user)
            ? reactions[idx].users.filter((u) => u !== user)
            : [...reactions[idx].users, user];
          if (users.length === 0) {
            reactions.splice(idx, 1);
          } else {
            reactions[idx] = { ...reactions[idx], users };
          }
        }
        return { ...msg, reactions };
      })
    );

    try {
      await toggleChatReaction(recordId, chatMessages, { messageId, emoji, user });
    } catch (error) {
      console.error("リアクションの送信に失敗しました:", error);
    }
  }

  // タイトル・概要・住所・出動内容・出動者・現場管理者・関連ニュースはonBlurで都度保存する
  // (入力の妨げにならないようデバウンスは行わず、フォーカスが外れたタイミングでのみ書き込む)
  async function handleSaveDetails() {
    if (!recordId || savingDetails) return;
    setSavingDetails(true);
    try {
      await updateDispatchTitleSummary(recordId, {
        title,
        summary,
        address,
        incidentType,
        dispatcherName,
        siteManagerName,
        newsUrl,
        newsSummary,
      });
    } catch (error) {
      console.error("出動記録の保存に失敗しました:", error);
    } finally {
      setSavingDetails(false);
    }
  }

  // 住所の自動補完: 現在の住所欄ではなく「現場名(タイトル)」を検索クエリとして
  // ジオコーディングし、最も可能性の高い住所候補を提示する。現在地は使用しない。
  async function handleSearchAddressCandidates() {
    const query = (title || record?.locationName || "").trim();
    if (!query || addressSearching) return;
    setAddressSearching(true);
    setAddressSearchError("");
    setAddressCandidates([]);
    try {
      const results = await geocodeQuery(query);
      if (results.length === 0) {
        setAddressSearchError("該当する住所候補が見つかりませんでした。現場名の表記を変えてお試しください。");
        return;
      }
      setAddressCandidates(results);
    } catch (error) {
      console.error("住所候補の検索に失敗しました:", error);
      setAddressSearchError("住所候補の検索に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setAddressSearching(false);
    }
  }

  function handleApplyAddressCandidate(candidate: GeocodeResult) {
    setAddress(candidate.displayName);
    setAddressCandidates([]);
    // 選択直後にすぐ保存する(onBlurを待たない)
    void updateDispatchTitleSummary(recordId, { address: candidate.displayName }).catch((error) => {
      console.error("住所の保存に失敗しました:", error);
    });
  }

  // 関連ニュースURLから記事本文を取得し、AIで概要を自動抽出・整理する
  async function handleFetchNewsSummary() {
    const url = newsUrl.trim();
    if (!url || newsLoading) return;
    setNewsLoading(true);
    setNewsError("");
    try {
      const res = await fetch("/api/dispatch/news-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNewsError(data.error || "概要の取得に失敗しました");
        return;
      }
      const summaryText = data.title ? `${data.title}\n${data.summary}` : data.summary;
      setNewsSummary(summaryText);
      await updateDispatchTitleSummary(recordId, { newsUrl: url, newsSummary: summaryText });
    } catch (error) {
      console.error("関連ニュース概要の取得に失敗しました:", error);
      setNewsError("概要の取得に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setNewsLoading(false);
    }
  }

  // 「対応完了(出動終了)」: タイトル・概要・住所・出動内容・出動者・現場管理者・
  // 関連ニュース・チャット履歴・現場情報・日時をまとめて構造化データとして保存し、
  // 出動状態をクローズする。以後は「出動記録」一覧から確認できる。
  async function handleComplete() {
    if (!recordId || completing) return;
    setCompleting(true);
    try {
      await completeDispatchRecord(recordId, {
        title,
        summary,
        address,
        incidentType,
        dispatcherName,
        siteManagerName,
        newsUrl,
        newsSummary,
      });
      router.push(`/dispatch/${recordId}`);
    } catch (error) {
      console.error("対応完了の保存に失敗しました:", error);
    } finally {
      setCompleting(false);
      setShowCompleteConfirm(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100 text-sm text-gray-500">
        読み込み中...
      </div>
    );
  }

  if (!record) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100 text-sm text-gray-500">
        出動記録が見つかりませんでした
      </div>
    );
  }

  const targetLocation =
    record.lat !== null && record.lng !== null ? { lat: record.lat, lng: record.lng } : null;

  const inputClass =
    "w-full text-xs sm:text-sm text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400";
  const labelClass = "block text-[11px] font-semibold text-gray-500 mb-0.5";

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <PageHeader
        title={`出動中: ${record.locationName}`}
        backHref={`/dispatch/${record.id}`}
        backLabel="記録詳細に戻る"
        action={
          <button
            onClick={() => setShowCompleteConfirm(true)}
            disabled={completing}
            className="bg-green-600 text-white text-xs sm:text-sm font-semibold rounded-lg px-3 py-1.5 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            対応完了
          </button>
        }
      />

      {/* タイトル・概要・住所・出動内容・出動者・現場管理者・関連ニュースの入力・保持エリア。
          各項目はプレースホルダーではなく入力欄の外側に独立したラベルを配置する。 */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-4 py-2 sm:py-3 flex-shrink-0 space-y-2 overflow-y-auto max-h-[45vh] md:max-h-[38vh]">
        <div>
          <label className={labelClass}>タイトル</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSaveDetails}
            className="w-full font-bold text-gray-900 text-sm sm:text-base border-0 border-b border-transparent focus:border-blue-400 focus:outline-none px-0 py-1 bg-transparent"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="relative">
            <div className="flex items-center justify-between">
              <label className={labelClass}>住所</label>
              <button
                type="button"
                onClick={handleSearchAddressCandidates}
                disabled={addressSearching}
                className="text-[10px] text-blue-600 hover:underline disabled:opacity-50 disabled:cursor-wait mb-0.5"
              >
                {addressSearching ? "検索中..." : "現場名から住所候補を検索"}
              </button>
            </div>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={handleSaveDetails}
              className={inputClass}
            />
            {addressSearchError && (
              <p className="text-[10px] text-red-600 mt-1">{addressSearchError}</p>
            )}
            {addressCandidates.length > 0 && (
              <ul className="absolute z-[1500] mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {addressCandidates.map((c, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => handleApplyAddressCandidate(c)}
                      className="w-full text-left px-2.5 py-1.5 text-xs text-gray-700 hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                    >
                      {c.displayName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <label className={labelClass}>出動内容(災害名・事件名)</label>
            <input
              type="text"
              value={incidentType}
              onChange={(e) => setIncidentType(e.target.value)}
              onBlur={handleSaveDetails}
              placeholder="例: ○○火災、○○事故"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>出動者</label>
            <input
              type="text"
              value={dispatcherName}
              onChange={(e) => setDispatcherName(e.target.value)}
              onBlur={handleSaveDetails}
              placeholder="例: 林拓海"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>現場管理者</label>
            <input
              type="text"
              value={siteManagerName}
              onChange={(e) => setSiteManagerName(e.target.value)}
              onBlur={handleSaveDetails}
              placeholder="例: 佐藤デスク"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>概要</label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onBlur={handleSaveDetails}
            rows={2}
            className="w-full text-xs sm:text-sm text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div>
          <label className={labelClass}>関連ニュースURL・概要整理</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={newsUrl}
              onChange={(e) => setNewsUrl(e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
            <button
              type="button"
              onClick={handleFetchNewsSummary}
              disabled={!newsUrl.trim() || newsLoading}
              className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {newsLoading ? "取得中..." : "概要を取得"}
            </button>
          </div>
          {newsError && <p className="text-[10px] text-red-600 mt-1">{newsError}</p>}
          {newsSummary && (
            <div className="mt-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2">
              <p className="text-xs text-gray-700 whitespace-pre-wrap">{newsSummary}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row min-h-0 gap-3 p-3 overflow-hidden">
        {/* 地図エリア: 現在地(青) + 対象現場(赤) を自動fitBoundsで表示 */}
        <div className="h-[40vh] md:h-auto md:flex-1 relative rounded-lg overflow-hidden shadow border border-gray-200">
          <LiveDispatchMap
            currentLocation={currentLocation}
            targetLocation={targetLocation}
            targetLabel={record.locationName}
            onLocated={(loc) => {
              gotFirstFixRef.current = true;
              setCurrentLocation(loc);
              setGpsStatus("active");
            }}
          />
          <div className="absolute top-2 left-2 z-[1000] bg-white/95 rounded-lg shadow px-2.5 py-1.5 text-[11px] space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 flex-shrink-0" />
              <span className="text-gray-700">現在地(自分)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 flex-shrink-0" />
              <span className="text-gray-700">対象現場</span>
            </div>
          </div>

          {/* GPS取得状況バッジ - 一目で状態がわかるよう地図右上に常時表示 */}
          <div
            className={`absolute top-2 right-2 z-[1000] rounded-full shadow px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1.5 ${
              gpsStatus === "active"
                ? "bg-green-600 text-white"
                : gpsStatus === "acquiring"
                  ? "bg-amber-500 text-white"
                  : "bg-red-600 text-white"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                gpsStatus === "acquiring" ? "animate-pulse bg-white" : "bg-white"
              }`}
            />
            <span>
              {gpsStatus === "active" && "GPSアクティブ"}
              {gpsStatus === "acquiring" && "GPS測位中..."}
              {gpsStatus === "denied" && "位置情報が許可されていません"}
              {gpsStatus === "unavailable" && "位置情報無効"}
            </span>
          </div>
        </div>

        {/* チャットエリア: Teams風レイアウト(発言者名・アバター・リアクション付き) */}
        <div className="flex flex-col w-full md:w-96 flex-shrink-0 min-h-0 bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
            <h2 className="text-sm font-bold text-gray-900">現場チャット</h2>
            <p className="text-[11px] text-gray-500">
              現場の状況を短くメモとして共有できます({chatMessages.length}件)
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-[120px]">
            {chatMessages.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">
                まだメッセージはありません。最初の状況共有を送ってみましょう。
              </p>
            ) : (
              chatMessages.map((msg) => {
                const time = new Date(msg.timestamp).toLocaleTimeString("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const myName = profile?.name || "不明";
                return (
                  <div key={msg.id} className="flex items-start gap-2">
                    {/* アバター - 誰の発言か一目でわかるように常時表示 */}
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 mt-0.5 ${avatarColorFor(msg.sender)}`}
                    >
                      {avatarInitial(msg.sender)}
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* 発言者名 - メッセージ本文の上に常時表示 */}
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xs font-semibold text-gray-900 truncate">{msg.sender}</span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">{time}</span>
                      </div>
                      <div className="mt-0.5 bg-gray-100 rounded-lg rounded-tl-sm px-3 py-1.5 text-sm text-gray-900 inline-block max-w-full">
                        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                      </div>

                      {/* 既についているリアクションの表示 */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {msg.reactions.map((r) => (
                            <button
                              key={r.emoji}
                              onClick={() => handleToggleReaction(msg.id, r.emoji)}
                              title={r.users.join(", ")}
                              className={`text-[11px] px-1.5 py-0.5 rounded-full border flex items-center gap-1 transition-colors ${
                                r.users.includes(myName)
                                  ? "bg-blue-50 border-blue-300 text-blue-700"
                                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                              }`}
                            >
                              <span>{r.emoji}</span>
                              <span>{r.users.length}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* クイックリアクションボタン - ワンタップで反応できる */}
                      <div className="flex gap-1 mt-1 opacity-70 hover:opacity-100 transition-opacity">
                        {QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => handleToggleReaction(msg.id, emoji)}
                            className="text-[11px] px-1.5 py-0.5 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-100"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* 入力エリア: テキスト送信 + 将来の画像/音声添付を見据えたレイアウト */}
          <div className="border-t border-gray-100 px-3 py-2 flex-shrink-0">
            <div className="flex items-end gap-2">
              <button
                type="button"
                disabled
                title="画像添付(準備中)"
                className="flex-shrink-0 text-[10px] px-2 py-2 rounded-lg border border-gray-200 text-gray-400 cursor-not-allowed"
              >
                画像
              </button>
              <button
                type="button"
                disabled
                title="音声入力(準備中)"
                className="flex-shrink-0 text-[10px] px-2 py-2 rounded-lg border border-gray-200 text-gray-400 cursor-not-allowed"
              >
                音声
              </button>
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChat();
                  }
                }}
                placeholder="メッセージを入力"
                rows={1}
                className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm text-base focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-24"
              />
              <button
                onClick={handleSendChat}
                disabled={!chatInput.trim() || sending}
                className="flex-shrink-0 px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                送信
              </button>
            </div>
          </div>

          <div className="px-3 pb-2 flex-shrink-0">
            <Link
              href={`/dispatch/${record.id}`}
              className="text-xs text-blue-600 hover:underline"
            >
              記録詳細・写真の追加はこちら →
            </Link>
          </div>
        </div>
      </div>

      {/* 対応完了の確認ダイアログ */}
      {showCompleteConfirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 px-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5 space-y-3">
            <h3 className="font-bold text-gray-900">対応完了として保存しますか?</h3>
            <p className="text-xs text-gray-600">
              タイトル・概要・チャット履歴・現場情報・日時をまとめて出動記録として保存し、
              出動状態を終了します。「出動記録」一覧から確認できるようになります。
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowCompleteConfirm(false)}
                disabled={completing}
                className="flex-1 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleComplete}
                disabled={completing}
                className="flex-1 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-400"
              >
                {completing ? "保存中..." : "対応完了にする"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
