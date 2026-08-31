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
  editChatMessage,
  deleteChatMessage,
  updateDispatchTitleSummary,
  completeDispatchRecord,
  deleteDispatchRecord,
  replaceChatMessages,
  type DispatchRecord,
  type ChatMessage,
  type TrackPoint,
} from "@/lib/dispatchRecords";
import { geocodeQuery, type GeocodeResult } from "@/lib/geocode";
import PageHeader from "@/components/PageHeader";
import { HazardMapToggle } from "@/components/HazardMapLayer";
import ConfirmDialog from "@/components/ConfirmDialog";

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

// 2点間の距離(メートル)。軌跡記録の間引き判定に使う。
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 動作確認用: 「局発→現場到着→中継実施→撤収→帰局」を網羅した長尺ダミーチャット履歴
// (東京駅 丸の内駅前広場付近の火災出動シナリオ)。
// 「自分」の発言は現在ログイン中のユーザー名(profile.name)を送信者として
// 割り当てることで、実際の画面と同じく右側・緑背景で表示されるようにする。
function buildDummyTechChatMessages(selfName: string): ChatMessage[] {
  const now = Date.now();
  // 今日の日付でHH:MMを指定してタイムスタンプを組み立てる
  const at = (hour: number, minute: number) => {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };

  const raw: Omit<ChatMessage, "id" | "type">[] = [
    {
      sender: "佐藤デスク",
      text: "【緊急出動指示】10:10頃、東京駅 丸の内駅前広場付近で火災の第一報。現場の状況確認および中継準備のため直ちに出動してください。",
      timestamp: at(10, 15),
    },
    {
      sender: "田中技術",
      text: "了解。技術車で中継機材(FPU・モバイル伝送装置・仮設アンテナ)を積み込み、10:20局発します。",
      timestamp: at(10, 17),
      reactions: [{ emoji: "了解", users: [selfName] }, { emoji: "👍", users: [selfName] }],
    },
    {
      sender: selfName,
      text: "ENGカメラ・音声セット携行で同行します。GPS追跡ONで移動開始します。",
      timestamp: at(10, 18),
    },
    {
      sender: "田中技術",
      text: "現場付近(丸の内ビル裏手)に到着。周辺に規制線あり。徒歩で広場東側へ機材搬入開始します。",
      timestamp: at(10, 35),
    },
    {
      sender: selfName,
      text: "広場東側にカメラセッティング完了。黒煙の立ち上がりを確認。1カメポジション確保しました。",
      timestamp: at(10, 38),
      reactions: [{ emoji: "了解", users: ["佐藤デスク"] }, { emoji: "👍", users: ["佐藤デスク"] }],
    },
    {
      sender: "佐藤デスク",
      text: "了解。煙の立ち上がりと規制線の引きを中心に撮影をお願いします。11:00からのニュース枠で1分30秒の生中継を行います。",
      timestamp: at(10, 40),
    },
    {
      sender: "田中技術",
      text: "FPU回線テスト中……本局受信用アンテナと同期完了。モバイルバックアップ線(5G×4)も通信良好、上り100Mbps確保。伝送準備完了です。",
      timestamp: at(10, 45),
    },
    {
      sender: "佐藤デスク",
      text: "消防発表によると火元は飲食店厨房。怪我人情報は現在確認中。関連ニュースURLを共有します。",
      timestamp: at(10, 48),
    },
    {
      sender: "佐藤デスク",
      text: "https://news.example.com/article/56789",
      timestamp: at(10, 49),
    },
    {
      sender: selfName,
      text: "ニュース概要確認。消火活動の寄りと集まっている野次馬の引き映像を収録完了。伝送ラインに乗せます。",
      timestamp: at(10, 52),
      reactions: [{ emoji: "了解", users: ["佐藤デスク"] }, { emoji: "🙏", users: ["佐藤デスク"] }],
    },
    {
      sender: "佐藤デスク",
      text: "11時枠ニュース始まりました。あと2分で丸の内現場に振ります。映像ライン確定OK。",
      timestamp: at(10, 58),
    },
    {
      sender: "田中技術",
      text: "映像・音声本線出力スタート。ノイズなし、伝送状態極めて安定しています。",
      timestamp: at(11, 0),
    },
    {
      sender: selfName,
      text: "中継映像送信中。カメラ固定パンで煙と消防車枠を捉えています。",
      timestamp: at(11, 1),
    },
    {
      sender: "佐藤デスク",
      text: "11時枠中継無事終了!映像クリアでした。先ほど消防より鎮火の発表あり。現場は安全を確認して撤収に入ってください。",
      timestamp: at(11, 5),
    },
    {
      sender: "田中技術",
      text: "了解。仮設アンテナおよび伝送機材の撤去作業に入ります。撤収完了予定11:25。",
      timestamp: at(11, 10),
      reactions: [{ emoji: "了解", users: [selfName] }, { emoji: "👍", users: [selfName] }],
    },
    {
      sender: selfName,
      text: "カメラ撤収完了。予備SDカードのバックアップ完了。技術車に乗り込み帰局移動開始します。",
      timestamp: at(11, 25),
    },
    {
      sender: "田中技術",
      text: "技術車、現場出発しました。首都高利用で約20分で局到着予定です。",
      timestamp: at(11, 28),
    },
    {
      sender: selfName,
      text: "局に到着しました。機材の返却および撮影素材のサーバーアップロードを開始します。",
      timestamp: at(11, 50),
    },
    {
      sender: "佐藤デスク",
      text: "お疲れ様でした!本出動の対応完了処理(ステータス完了)をお願いします。",
      timestamp: at(11, 52),
      reactions: [{ emoji: "了解", users: [selfName] }, { emoji: "🙏", users: [selfName] }],
    },
  ];

  return raw.map((m, i) => ({
    id: `dummy-${i + 1}-${now}`,
    type: "text",
    ...m,
  }));
}

// チャット履歴のAI要約結果(/api/dispatch/chat-summary のレスポンス)
type ChatSummary = {
  crewStatus: string; // ■ 現場の状況とクルーの動き
  instructions: string; // ■ 主な指示と対応
  currentPhase: string; // ■ 現在のステータス
};

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
  const [showHazardMap, setShowHazardMap] = useState(false);
  // GPS移動履歴(軌跡)。位置情報を取得するたびに蓄積し、対応完了時に出動記録として保存する。
  const [track, setTrack] = useState<TrackPoint[]>([]);
  // 直近で記録した軌跡の座標(近すぎる点を連続で積み増ししないための間引き用)
  const lastTrackPointRef = useRef<{ lat: number; lng: number } | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  // 自分のメッセージのインライン編集・削除
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  // チャット履歴のAI要約
  const [chatSummary, setChatSummary] = useState<ChatSummary | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [showSummaryPanel, setShowSummaryPanel] = useState(false);
  // 動作確認用ダミーチャット(技術担当シナリオ)の読み込み状態・確認ダイアログ
  const [loadingDummyChat, setLoadingDummyChat] = useState(false);
  const [showDummyChatConfirm, setShowDummyChatConfirm] = useState(false);
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
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
  // 削除実行時にリアルタイム購読を明示的に止めるためのref。
  // (削除後もonSnapshotが生きたままだと、ドキュメントが無くなった直後に
  // Firestoreルール上permission-deniedのエラーコールバックが発火してしまうため)
  const unsubscribeSnapshotRef = useRef<(() => void) | null>(null);
  // 削除処理中かどうか。onSnapshotのエラーハンドラで、削除に伴う想定内の
  // 購読エラーをconsole.errorではなくconsole.warnに留めるために参照する。
  const deletingRef = useRef(false);

  // GPS移動履歴(軌跡)に1点追加する。直前の記録点から一定距離(10m)以上
  // 離れている場合のみ追加し、停止中に無意味な点が大量に積み上がるのを防ぐ。
  function recordTrackPoint(loc: { lat: number; lng: number }) {
    const last = lastTrackPointRef.current;
    if (last && distanceMeters(last, loc) < 10) return;
    lastTrackPointRef.current = loc;
    const point: TrackPoint = { lat: loc.lat, lng: loc.lng, time: new Date().toISOString() };
    setTrack((prev) => [...prev, point]);
  }

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
          setTrack(data.track || []);
          if (data.track && data.track.length > 0) {
            const last = data.track[data.track.length - 1];
            lastTrackPointRef.current = { lat: last.lat, lng: last.lng };
          }
          detailsInitializedRef.current = true;
        }
        setLoading(false);
      },
      (error) => {
        if (deletingRef.current) {
          // 削除操作に伴う想定内のエラー(この画面から既に離脱中のため実害なし)
          console.warn("出動記録の削除に伴い購読を終了しました:", error);
        } else {
          console.error("出動記録のリアルタイム購読に失敗しました:", error);
        }
        setLoading(false);
      }
    );
    unsubscribeSnapshotRef.current = unsubscribe;

    return () => {
      unsubscribe();
      unsubscribeSnapshotRef.current = null;
    };
  }, [authLoading, user, recordId, router]);

  // 出動中は常時GPSを追跡し、現在地ピンをリアルタイム更新する。画面を離れたら
  // 追跡を止めてバッテリー消費を抑える。
  //
  // 二段階フォールバック方式:
  //   1. まず enableHighAccuracy:true (timeout 5000ms) で高精度測位を試みる
  //   2. タイムアウト・測位不可(POSITION_UNAVAILABLE/TIMEOUT)で失敗した場合は、
  //      自動的に enableHighAccuracy:false (timeout 8000ms、Wi-Fi/IP測位)へ
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
      console.warn("[GPS Error] この端末/環境では位置情報が利用できません");
      setGpsStatus("unavailable");
      setCurrentLocation(DEFAULT_LOCATION);
      return;
    }

    gotFirstFixRef.current = false;
    permissionDeniedRef.current = false;
    setGpsStatus("acquiring");

    function handleFix(position: GeolocationPosition) {
      gotFirstFixRef.current = true;
      console.log("[GPS Debug]", position);
      const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
      setCurrentLocation(loc);
      setGpsStatus("active");
      recordTrackPoint(loc);
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
      console.log("[GPS Debug] 標準精度(Wi-Fi/IP測位)へフォールバックします(timeout 8000ms)");
      const id = navigator.geolocation.watchPosition(
        handleFix,
        (error) => {
          console.warn("[GPS Error] 現在地の取得に失敗しました(標準精度):", error);
          if (error.code === error.PERMISSION_DENIED) {
            permissionDeniedRef.current = true;
            setGpsStatus("denied");
          } else if (!gotFirstFixRef.current) {
            // 両方の試行で一度も測位できていない場合のみ、フォールバック座標を使う
            setGpsStatus("unavailable");
            setCurrentLocation((prev) => prev ?? DEFAULT_LOCATION);
          }
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 5000 }
      );
      standardAccuracyWatchIdRef.current = id;
    }

    console.log("[GPS Debug] 継続追跡を開始します(高精度, timeout 5000ms)");
    const highId = navigator.geolocation.watchPosition(
      handleFix,
      (error) => {
        console.warn("[GPS Error] 現在地の取得に失敗しました(高精度):", error);
        if (error.code === error.PERMISSION_DENIED) {
          permissionDeniedRef.current = true;
          setGpsStatus("denied");
          return;
        }
        // タイムアウト・測位不可の場合は標準精度(Wi-Fi/IP測位)へフォールバックする
        startStandardAccuracyWatch();
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 5000 }
    );
    highAccuracyWatchIdRef.current = highId;

    // 5.5秒経っても高精度側から一度もfixが得られない場合の保険として、
    // 標準精度の並行追跡を開始する(高精度watchPositionはtimeout到達後もエラー
    // コールバックが発火しない実装のブラウザがあるため、タイマーで確実に補う)。
    // ただし権限拒否と判明済みの場合はここでも再試行しない。
    fallbackTimerRef.current = setTimeout(() => {
      if (!gotFirstFixRef.current && !permissionDeniedRef.current) {
        startStandardAccuracyWatch();
      }
    }, 5500);

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

  // 自分のメッセージのインライン編集を開始する
  function startEditMessage(msg: ChatMessage) {
    setEditingMessageId(msg.id);
    setEditingText(msg.text);
  }

  function cancelEditMessage() {
    setEditingMessageId(null);
    setEditingText("");
  }

  // 編集内容を保存する(editedAtが付与され「(編集済み)」表示になる)
  async function handleSaveEditMessage(messageId: string) {
    const text = editingText.trim();
    if (!recordId || !text || savingEdit) return;

    const myName = profile?.name || "不明";
    const target = chatMessages.find((m) => m.id === messageId);
    if (!target || target.sender !== myName) return;
    if (text === target.text) {
      cancelEditMessage();
      return;
    }

    setSavingEdit(true);
    const previous = chatMessages;
    // 楽観的更新
    setChatMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, text, editedAt: new Date().toISOString() } : m
      )
    );
    cancelEditMessage();

    try {
      await editChatMessage(recordId, previous, { messageId, text, user: myName });
    } catch (error) {
      console.error("メッセージの編集に失敗しました:", error);
      setChatMessages(previous);
    } finally {
      setSavingEdit(false);
    }
  }

  // 自分のメッセージを削除する(確認ダイアログでOKされた後に呼ばれる)
  async function handleDeleteMessage(messageId: string) {
    if (!recordId) return;
    const myName = profile?.name || "不明";
    const previous = chatMessages;

    setDeleteTargetId(null);
    // 楽観的更新
    setChatMessages((prev) => prev.filter((m) => m.id !== messageId));

    try {
      await deleteChatMessage(recordId, previous, { messageId, user: myName });
    } catch (error) {
      console.error("メッセージの削除に失敗しました:", error);
      setChatMessages(previous);
    }
  }

  // チャット履歴をAI(Claude Haiku)で要約する
  async function handleSummarizeChat() {
    if (summarizing || chatMessages.length === 0) return;
    setSummarizing(true);
    setSummaryError("");
    setShowSummaryPanel(true);

    try {
      const res = await fetch("/api/dispatch/chat-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatMessages.map((m) => ({
            sender: m.sender,
            text: m.text,
            timestamp: m.timestamp,
          })),
          locationName: record?.locationName || "",
          incidentType: record?.incidentType || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSummaryError(data.error || "要約の生成に失敗しました");
        setChatSummary(null);
        return;
      }
      setChatSummary({
        crewStatus: data.crewStatus || "",
        instructions: data.instructions || "",
        currentPhase: data.currentPhase || "",
      });
    } catch (error) {
      console.error("チャット要約の生成に失敗しました:", error);
      setSummaryError("要約の生成中にエラーが発生しました");
      setChatSummary(null);
    } finally {
      setSummarizing(false);
    }
  }

  // 動作確認用: 技術担当シナリオのダミーチャット履歴を読み込む(既存のチャットは上書きされる)
  async function handleLoadDummyChat() {
    if (!recordId || loadingDummyChat) return;
    setLoadingDummyChat(true);
    try {
      const selfName = profile?.name || "管理者(自分)";
      const dummyMessages = buildDummyTechChatMessages(selfName);
      await replaceChatMessages(recordId, dummyMessages);
      setChatMessages(dummyMessages);
    } catch (error) {
      console.error("ダミーチャットの読み込みに失敗しました:", error);
    } finally {
      setLoadingDummyChat(false);
      setShowDummyChatConfirm(false);
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
        track,
      });
      // 対応完了後は「出動記録一覧」画面へ自動遷移する
      router.push("/dispatch");
    } catch (error) {
      console.error("対応完了の保存に失敗しました:", error);
    } finally {
      setCompleting(false);
      setShowCompleteConfirm(false);
    }
  }

  // 「削除」: この出動記録を完全に削除する。誤操作防止のため確認ダイアログを
  // 経てから実行し、削除後は出動中一覧画面へ遷移する(この記録はもう存在しないため)。
  async function handleDelete() {
    if (!recordId || deleting) return;
    setDeleting(true);
    deletingRef.current = true;
    // 削除実行前にリアルタイム購読を止め、削除直後のpermission-deniedな
    // エラーコールバックが発生しないようにする
    if (unsubscribeSnapshotRef.current) {
      unsubscribeSnapshotRef.current();
      unsubscribeSnapshotRef.current = null;
    }
    try {
      await deleteDispatchRecord(recordId);
      router.push("/dispatch/active");
    } catch (error) {
      console.error("出動記録の削除に失敗しました:", error);
      deletingRef.current = false;
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
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

  // コンパクト化された入力欄の共通スタイル(縦幅を抑えるためpy-1・text-xsに統一)
  const inputClass =
    "w-full text-xs text-gray-700 border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400";
  const labelClass = "block text-[10px] font-semibold text-gray-500 mb-0.5";

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <PageHeader
        title={`出動中: ${record.locationName}`}
        backHref="/dispatch/active"
        backLabel="出動中一覧に戻る"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              className="bg-transparent border border-red-500 text-red-400 text-xs sm:text-sm font-semibold rounded-lg px-3 py-1.5 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              削除
            </button>
            <button
              onClick={() => setShowCompleteConfirm(true)}
              disabled={completing}
              className="bg-green-600 text-white text-xs sm:text-sm font-semibold rounded-lg px-3 py-1.5 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              対応完了
            </button>
          </div>
        }
      />

      {/* メインエリア: 左カラム(入力+地図) / 右カラム(フルハイトのチャット) の2カラム構成。
          lg未満では上から入力→地図→チャットの縦積みに切り替わる。 */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3 p-3 min-h-0 overflow-hidden">
        {/* 左カラム: コンパクトな入力エリア(上段) + 地図(下段、確保された余白を活かして大きく表示) */}
        <div className="lg:col-span-2 flex flex-col gap-3 min-h-0 overflow-y-auto lg:overflow-visible">
          {/* タイトル・概要・住所・出動内容・出動者・現場管理者・関連ニュースの入力・保持エリア。
              各項目はプレースホルダーではなく入力欄の外側に独立したラベルを配置する。
              グリッドで横方向に項目を並べ、縦幅を大幅に圧縮している。 */}
          <div className="bg-white rounded-lg shadow border border-gray-200 px-2.5 py-2 flex-shrink-0 space-y-1.5">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleSaveDetails}
              placeholder="タイトル(事件・事故名など)"
              className="w-full font-bold text-gray-900 text-sm border-0 border-b border-transparent focus:border-blue-400 focus:outline-none px-0 py-0.5 bg-transparent"
            />

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
              <div className="relative lg:col-span-2">
                <div className="flex items-center justify-between gap-1">
                  <label className={labelClass}>住所</label>
                  <button
                    type="button"
                    onClick={handleSearchAddressCandidates}
                    disabled={addressSearching}
                    className="text-[9px] text-blue-600 hover:underline disabled:opacity-50 disabled:cursor-wait mb-0.5 truncate flex-shrink-0"
                  >
                    {addressSearching ? "検索中..." : "現場名から検索"}
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
                  <p className="text-[9px] text-red-600 mt-0.5">{addressSearchError}</p>
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
                  placeholder="例: ○○火災"
                  className={inputClass}
                />
              </div>
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
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
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
              <div className="lg:col-span-3">
                <label className={labelClass}>概要</label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  onBlur={handleSaveDetails}
                  rows={1}
                  className="w-full text-xs text-gray-700 border border-gray-200 rounded-md px-2 py-1 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>関連ニュースURL・概要整理</label>
              <div className="flex gap-1.5">
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
                  className="flex-shrink-0 px-2.5 py-1 text-[11px] font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {newsLoading ? "取得中..." : "概要を取得"}
                </button>
              </div>
              {newsError && <p className="text-[9px] text-red-600 mt-0.5">{newsError}</p>}
              {newsSummary && (
                <div className="mt-1 bg-gray-50 border border-gray-200 rounded-md px-2 py-1.5">
                  <p className="text-[11px] text-gray-700 whitespace-pre-wrap">{newsSummary}</p>
                </div>
              )}
            </div>
          </div>

          {/* 地図エリア: 現在地(青) + 対象現場(赤) を自動fitBoundsで表示。
              入力エリアの圧縮で確保した余白を活かし、大きく見やすく表示する。 */}
          <div className="flex-1 min-h-[320px] relative rounded-lg overflow-hidden shadow border border-gray-200">
            <LiveDispatchMap
              currentLocation={currentLocation}
              targetLocation={targetLocation}
              targetLabel={record.locationName}
              trackPoints={track}
              showHazardMap={showHazardMap}
              onLocated={(loc) => {
                gotFirstFixRef.current = true;
                setCurrentLocation(loc);
                setGpsStatus("active");
                recordTrackPoint(loc);
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

            {/* 地図右上のコントロール群 - GPS取得状況バッジとハザードマップトグルを
                同一のflexコンテナに並べることで、どちらもテキスト長に応じて幅が
                変わっても重ならないようにする */}
            <div className="absolute top-2 right-2 z-[1000] flex flex-col items-end gap-2">
              <div
                className={`rounded-full shadow px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1.5 ${
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

              <HazardMapToggle
                enabled={showHazardMap}
                onToggle={() => setShowHazardMap((v) => !v)}
                className="pointer-events-auto"
              />
            </div>
          </div>
        </div>

        {/* 右カラム: 画面縦いっぱいのフルハイトチャット(Teams風、発言者名・アバター・リアクション付き) */}
        <div className="lg:col-span-1 flex flex-col min-h-0 h-full bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-gray-900">現場チャット</h2>
                <p className="text-[11px] text-gray-500">
                  現場の状況を短くメモとして共有できます({chatMessages.length}件)
                </p>
              </div>
              <div className="flex flex-col gap-1 flex-shrink-0 items-end">
                <button
                  type="button"
                  onClick={handleSummarizeChat}
                  disabled={summarizing || chatMessages.length === 0}
                  className="text-[11px] px-2 py-1 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  {summarizing ? "要約中..." : "チャット履歴を要約"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDummyChatConfirm(true)}
                  disabled={loadingDummyChat}
                  title="動作確認用の火災出動シナリオ(局発〜中継〜撤収)のダミーチャットを読み込みます(既存のチャットは上書きされます)"
                  className="text-[11px] px-2 py-1 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 font-semibold hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  {loadingDummyChat ? "読み込み中..." : "ダミーチャットを読み込む"}
                </button>
              </div>
            </div>

            {/* AI要約の結果パネル */}
            {showSummaryPanel && (
              <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/60 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold text-blue-900">AIによるチャット履歴の要約</p>
                  <button
                    type="button"
                    onClick={() => setShowSummaryPanel(false)}
                    className="text-[11px] text-blue-700 hover:underline flex-shrink-0"
                  >
                    閉じる
                  </button>
                </div>

                {summarizing && (
                  <p className="text-[11px] text-blue-800 mt-1">履歴を読み込んで要約しています...</p>
                )}
                {!summarizing && summaryError && (
                  <p className="text-[11px] text-red-600 mt-1">{summaryError}</p>
                )}
                {!summarizing && !summaryError && chatSummary && (
                  <div className="mt-1.5 space-y-2 max-h-56 overflow-y-auto">
                    {chatSummary.crewStatus && (
                      <div>
                        <p className="text-[11px] font-semibold text-gray-900">■ 現場の状況とクルーの動き</p>
                        <p className="text-[11px] text-gray-800 whitespace-pre-wrap">{chatSummary.crewStatus}</p>
                      </div>
                    )}
                    {chatSummary.instructions && (
                      <div>
                        <p className="text-[11px] font-semibold text-gray-900">■ 主な指示と対応</p>
                        <p className="text-[11px] text-gray-800 whitespace-pre-wrap">{chatSummary.instructions}</p>
                      </div>
                    )}
                    {chatSummary.currentPhase && (
                      <div>
                        <p className="text-[11px] font-semibold text-gray-900">■ 現在のステータス</p>
                        <p className="text-[11px] text-gray-800 whitespace-pre-wrap">{chatSummary.currentPhase}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
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
                // 自分の発言は右側・緑の吹き出し、相手の発言は従来どおり左側・グレー
                const isMine = msg.sender === myName;
                const isEditing = editingMessageId === msg.id;
                return (
                  <div
                    key={msg.id}
                    className={`group flex items-start gap-2 ${isMine ? "flex-row-reverse" : ""}`}
                  >
                    {/* アバター - 誰の発言か一目でわかるように常時表示 */}
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 mt-0.5 ${avatarColorFor(msg.sender)}`}
                    >
                      {avatarInitial(msg.sender)}
                    </div>
                    <div className={`min-w-0 flex-1 ${isMine ? "flex flex-col items-end" : ""}`}>
                      {/* 発言者名 - メッセージ本文の上に常時表示 */}
                      <div className={`flex items-baseline gap-1.5 ${isMine ? "flex-row-reverse" : ""}`}>
                        <span className="text-xs font-semibold text-gray-900 truncate">{msg.sender}</span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">{time}</span>
                        {msg.editedAt && (
                          <span className="text-[10px] text-gray-400 flex-shrink-0">(編集済み)</span>
                        )}
                      </div>

                      {isEditing ? (
                        /* インライン編集: 自分のメッセージのみ */
                        <div className="mt-0.5 w-full">
                          <textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              // IME変換確定のEnterでは保存しない
                              if (e.nativeEvent.isComposing || e.key === "Process") return;
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSaveEditMessage(msg.id);
                              }
                              if (e.key === "Escape") cancelEditMessage();
                            }}
                            rows={2}
                            className="w-full resize-none border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <div className="flex gap-1.5 mt-1 justify-end">
                            <button
                              type="button"
                              onClick={cancelEditMessage}
                              className="text-[11px] px-2 py-0.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                            >
                              キャンセル
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEditMessage(msg.id)}
                              disabled={!editingText.trim() || savingEdit}
                              className="text-[11px] px-2 py-0.5 rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                              保存
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className={`flex items-center gap-1 mt-0.5 ${isMine ? "flex-row-reverse" : ""}`}>
                          <div
                            className={`rounded-lg px-3 py-1.5 text-sm inline-block max-w-full ${
                              isMine
                                ? "bg-emerald-600 text-white rounded-tr-sm"
                                : "bg-gray-100 text-gray-900 rounded-tl-sm"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                          </div>

                          {/* 自分の発言だけホバーで編集・削除を出す */}
                          {isMine && (
                            <div className="flex-shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => startEditMessage(msg)}
                                title="編集"
                                className="text-[11px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-100"
                              >
                                編集
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTargetId(msg.id)}
                                title="削除"
                                className="text-[11px] px-1.5 py-0.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                              >
                                削除
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 既についているリアクションの表示 */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? "justify-end" : ""}`}>
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
                      <div className={`flex gap-1 mt-1 opacity-70 hover:opacity-100 transition-opacity ${isMine ? "justify-end" : ""}`}>
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
                  // IME変換中(日本語入力の確定Enter)は送信しない。
                  // isComposingはブラウザによりkeydown時点でfalseになる場合があるため、
                  // key === "Process" も併せて判定する。
                  if (e.nativeEvent.isComposing || e.key === "Process") return;
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
              タイトル・概要・チャット履歴・GPS移動履歴(軌跡)・現場情報・日時をまとめて出動記録として保存し、
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

      {/* 削除確認ダイアログ - 地図等より確実に前面に表示するためPortalでbody直下に描画(z-[9999]) */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="この出動記録を削除しますか?"
        summary={[
          { label: "現場名", value: record.locationName },
          { label: "住所", value: record.address },
          { label: "出動内容", value: record.incidentType },
        ]}
        confirmLabel="削除する"
        submitting={deleting}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
      />

      {/* ダミーチャット読み込みの確認ダイアログ(動作確認用) */}
      <ConfirmDialog
        open={showDummyChatConfirm}
        title="動作確認用のダミーチャットを読み込みますか?"
        summary={[
          { label: "内容", value: "火災出動シナリオ(局発→現場中継→撤収→帰局、佐藤デスク・田中技術とのやり取り、19件)" },
          { label: "注意", value: "現在のチャット履歴は上書きされます" },
        ]}
        confirmLabel="読み込む"
        submitting={loadingDummyChat}
        onCancel={() => setShowDummyChatConfirm(false)}
        onConfirm={handleLoadDummyChat}
      />

      {/* チャットメッセージの削除確認ダイアログ(自分の発言のみ) */}
      <ConfirmDialog
        open={deleteTargetId !== null}
        title="このメッセージを削除しますか?"
        summary={[
          {
            label: "本文",
            value: chatMessages.find((m) => m.id === deleteTargetId)?.text || "",
          },
        ]}
        confirmLabel="削除する"
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={() => {
          if (deleteTargetId) handleDeleteMessage(deleteTargetId);
        }}
      />
    </div>
  );
}
