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
  updateDispatchTitleSummary,
  completeDispatchRecord,
  type DispatchRecord,
  type ChatMessage,
} from "@/lib/dispatchRecords";
import PageHeader from "@/components/PageHeader";

// LeafletはSSR非対応なのでクライアント側のみで読み込む
const LiveDispatchMap = dynamic(() => import("@/components/LiveDispatchMap"), { ssr: false });

// 東京駅周辺（位置情報が拒否/取得失敗した場合のフォールバック座標）
const DEFAULT_LOCATION = { lat: 35.681236, lng: 139.767125 };

export default function LiveDispatchPage() {
  const params = useParams();
  const router = useRouter();
  const recordId = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
  const { user, profile, loading: authLoading } = useAuth();

  const [record, setRecord] = useState<DispatchRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // タイトル・概要(出動中画面での編集用)
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

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

  // 出動中は常時GPSを追跡し、現在地ピンをリアルタイム更新する。
  // 画面を離れたら追跡を止めてバッテリー消費を抑える。
  useEffect(() => {
    if (authLoading || !user) return;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setCurrentLocation(DEFAULT_LOCATION);
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      (error) => {
        console.warn("現在地の取得に失敗しました。デフォルト座標を使用します:", error);
        setCurrentLocation(DEFAULT_LOCATION);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
    watchIdRef.current = id;

    return () => {
      navigator.geolocation.clearWatch(id);
      watchIdRef.current = null;
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

  // タイトル・概要はonBlurで都度保存する(入力の妨げにならないようデバウンスは行わず、
  // フォーカスが外れたタイミングでのみ書き込む)
  async function handleSaveDetails() {
    if (!recordId || savingDetails) return;
    setSavingDetails(true);
    try {
      await updateDispatchTitleSummary(recordId, { title, summary });
    } catch (error) {
      console.error("タイトル・概要の保存に失敗しました:", error);
    } finally {
      setSavingDetails(false);
    }
  }

  // 「対応完了(出動終了)」: タイトル・概要・チャット履歴・現場情報・日時をまとめて
  // 構造化データとして保存し、出動状態をクローズする。以後は「出動記録」一覧から確認できる。
  async function handleComplete() {
    if (!recordId || completing) return;
    setCompleting(true);
    try {
      await completeDispatchRecord(recordId, { title, summary });
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

      {/* タイトル・概要の入力・保持エリア */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-4 py-2 sm:py-3 flex-shrink-0 space-y-1.5">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleSaveDetails}
          placeholder="事件・事故のタイトル"
          className="w-full font-bold text-gray-900 text-sm sm:text-base border-0 border-b border-transparent focus:border-blue-400 focus:outline-none px-0 py-1 bg-transparent"
        />
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onBlur={handleSaveDetails}
          placeholder="概要(状況の要点をメモしておくと後で報告書作成が楽になります)"
          rows={2}
          className="w-full text-xs sm:text-sm text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* 地図エリア: 現在地(青) + 対象現場(赤) を自動fitBoundsで表示 */}
        <div className="h-[45vh] md:h-auto md:flex-1 relative border-b md:border-b-0 md:border-r border-gray-200">
          <LiveDispatchMap
            currentLocation={currentLocation}
            targetLocation={targetLocation}
            targetLabel={record.locationName}
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
        </div>

        {/* チャットエリア: 構造化メッセージ履歴(将来のAI要約用) */}
        <div className="flex flex-col w-full md:w-96 flex-shrink-0 min-h-0 bg-white">
          <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
            <h2 className="text-sm font-bold text-gray-900">現場チャット</h2>
            <p className="text-[11px] text-gray-500">
              現場の状況を短くメモとして共有できます({chatMessages.length}件)
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-[120px]">
            {chatMessages.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">
                まだメッセージはありません。最初の状況共有を送ってみましょう。
              </p>
            ) : (
              chatMessages.map((msg) => {
                const isSelf = msg.sender === profile?.name;
                const time = new Date(msg.timestamp).toLocaleTimeString("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isSelf ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${
                        isSelf
                          ? "bg-blue-600 text-white rounded-br-sm"
                          : "bg-gray-100 text-gray-900 rounded-bl-sm"
                      }`}
                    >
                      {!isSelf && (
                        <p className="text-[10px] font-semibold opacity-70 mb-0.5">{msg.sender}</p>
                      )}
                      <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 mt-0.5 px-0.5">{time}</span>
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
                placeholder="現場の状況を入力(例: 到着しました。中継準備開始します)"
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
