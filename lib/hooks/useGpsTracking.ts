"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type {
  BackgroundGeolocationPlugin,
  CallbackError,
  Location as NativeLocation,
} from "@capacitor-community/background-geolocation";

// このプラグインはコンパイル済みJSを持たず、registerPluginで自前登録する形式
// (READMEの使用例に準拠)。Webでは呼ばれないため、Web版ビルドには影響しない。
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
  "BackgroundGeolocation",
);

export type GpsStatus = "acquiring" | "active" | "denied" | "unavailable";

type LatLng = { lat: number; lng: number };

interface UseGpsTrackingOptions {
  // trueの間だけ追跡する(画面離脱・出動対応完了時などにfalseにして停止する)
  enabled: boolean;
  // 位置が更新されるたびに呼ばれる(軌跡の記録などに利用)
  onFix?: (loc: LatLng) => void;
  // 権限拒否・非対応端末以外でどうしても測位できない場合に使うフォールバック座標
  defaultLocation?: LatLng;
}

interface UseGpsTrackingResult {
  currentLocation: LatLng | null;
  gpsStatus: GpsStatus;
  // 「現在地を表示」ボタン等、hook外から明示的に取得した位置を追跡状態に反映させる
  reportManualFix: (loc: LatLng) => void;
  // ネイティブ(iOS)で「常に許可」が必要な旨を案内するモーダルを表示すべきか。
  // バックグラウンド追跡の開始時、および位置情報が未許可(NOT_AUTHORIZED)と
  // わかった時にtrueになる。表示側はこれを見てAlwaysLocationPermissionModal等を出す。
  showAlwaysPermissionPrompt: boolean;
  // 案内モーダルを閉じる(「あとで設定する」・背景タップなど)
  dismissAlwaysPermissionPrompt: () => void;
}

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000, // 10秒でタイムアウト判定
  maximumAge: 3000, // 3秒以内に取得済みの位置ならキャッシュを許容
};

// バックオフ再試行の間隔(ms)。TIMEOUT/POSITION_UNAVAILABLEのたびに段階的に延ばし、
// 上限に達したら以降はその間隔で再試行し続ける。
const BACKOFF_STEPS_MS = [2000, 4000, 8000, 15000];
// 静止中(distanceFilter/watchPositionのイベントが発火しない間)でも、管理者画面や
// 他メンバーの地図上のピンが「最新のオンライン位置」として更新され続けるよう、
// 移動の有無に関わらず一定間隔で現在地を強制的に再取得・再通知する間隔。
const FORCE_SEND_INTERVAL_MS = 20000;

/**
 * 出動中の現在地(GPS)を安定して継続取得するためのフック。
 *
 * バックグラウンド切り替え・端末スリープ・一時的な電波障害などでも追跡が
 * 完全に停止してしまわないよう、以下の対策を組み合わせている:
 *
 *   1. watchPositionのオプションを最適化(高精度・timeout 10秒・maximumAge 3秒)
 *   2. TIMEOUT/POSITION_UNAVAILABLEでは追跡を止めず、バックオフしながら自動再試行
 *   3. Page Visibility APIで画面復帰を検知し、watchPositionを再起動 + 即時再取得
 *   4. Screen Wake Lock APIで追跡中は画面消灯を防止(対応端末のみ・失敗しても無視)
 *   5. watchPositionの発火だけに頼らず、一定間隔でのハートビートにより
 *      更新が滞っていればgetCurrentPositionで強制的に再取得する
 */
export function useGpsTracking({
  enabled,
  onFix,
  defaultLocation,
}: UseGpsTrackingOptions): UseGpsTrackingResult {
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("acquiring");
  const [showAlwaysPermissionPrompt, setShowAlwaysPermissionPrompt] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const backoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const forceSendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFixAtRef = useRef<number>(0);
  // ネイティブ(distanceFilterベース)は単発のgetCurrentPosition相当のAPIを
  // 持たないため、強制送信タイマーでは直近に受信済みの座標を再通知する。
  const lastNativeLocRef = useRef<LatLng | null>(null);
  const retryCountRef = useRef(0);
  const gotFirstFixRef = useRef(false);
  const permissionDeniedRef = useRef(false);
  // enabled=falseになった後に非同期コールバックが古いwatchIdを再起動してしまう
  // (画面遷移後の"Cannot read properties of undefined"系エラーの原因にもなる)のを防ぐ
  const activeRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const onFixRef = useRef(onFix);
  onFixRef.current = onFix;

  useEffect(() => {
    if (!enabled) return;

    // ネイティブアプリ(Capacitor/iOS)実行時は @capacitor-community/background-geolocation
    // を使い、アプリがバックグラウンド・端末スリープ中でも5m移動ごとに位置を取得し続ける。
    // (Web版のwatchPositionはブラウザ/OSの制約でバックグラウンド追跡ができないため)
    //
    // このプラグイン(v1.2.26)がJSから設定できるのはWatcherOptions
    // (backgroundMessage / backgroundTitle / requestPermissions / stale /
    //  distanceFilter)のみで、精度(desiredAccuracy)や取得間隔
    // (interval / fastInterval)を指定するオプションは存在しない
    // (ios/Plugin/Swift/Plugin.swiftを確認済み)。iOS側は常に
    // manager.desiredAccuracy = 外部電源時kCLLocationAccuracyBestForNavigation /
    // それ以外はkCLLocationAccuracyBest を自動選択しており、これは既に
    // 最高精度相当のため追加設定は不要。取得間隔もCLLocationManagerの
    // watchPosition的な仕組み(位置が変化するたびにコールバック)であり、
    // タイマーPollingではないため秒間隔の指定自体になじまない。
    if (Capacitor.isNativePlatform()) {
      let watcherId: string | null = null;
      let cancelled = false;
      activeRef.current = true;
      setGpsStatus("acquiring");

      // バックグラウンド追跡を開始するタイミングで、「常に許可」への誘導モーダルを
      // 一度案内する。このプラグインはCLLocationManagerの現在の認可状態を直接
      // 取得する手段を提供していないため、「開始時に必ず一度案内」+「NOT_AUTHORIZED
      // エラー時に再度案内」の2段構えにしている(既に「常に許可」済みのユーザーは
      // 「あとで設定する」で閉じれば以降のトラッキング中は再表示されない)。
      setShowAlwaysPermissionPrompt(true);

      BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: "取材クルーの移動経路を記録中...",
          backgroundTitle: "SpotBase 位置情報追跡中",
          requestPermissions: true,
          stale: false,
          // カーブ・曲がり角を綺麗に記録するため、直線区間を間引く距離フィルタを
          // 10m→5mに狭め、より細かい移動変化を検知できるようにしている。
          // (このプラグインが対応する設定項目はdistanceFilterのみ。
          //  desiredAccuracy・interval/fastIntervalに相当するオプションは
          //  存在しないため設定していない。詳細は下の注記を参照)
          distanceFilter: 5,
        },
        (position?: NativeLocation, error?: CallbackError) => {
          if (cancelled || !activeRef.current) return;
          if (error) {
            console.warn("[GPS Error][Native] 位置情報の取得に失敗しました:", error);
            if (error.code === "NOT_AUTHORIZED") {
              setGpsStatus("denied");
              // 未許可が確定した場合は、閉じていても改めて「常に許可」を案内する
              setShowAlwaysPermissionPrompt(true);
            } else if (!gotFirstFixRef.current) {
              setGpsStatus("unavailable");
              if (defaultLocation) setCurrentLocation((prev) => prev ?? defaultLocation);
            }
            return;
          }
          if (!position) return;
          gotFirstFixRef.current = true;
          lastFixAtRef.current = Date.now();
          const loc = { lat: position.latitude, lng: position.longitude };
          console.log("[GPS Debug][Native] fix取得", loc);
          lastNativeLocRef.current = loc;
          setCurrentLocation(loc);
          setGpsStatus("active");
          onFixRef.current?.(loc);
        },
      )
        .then((id: string) => {
          if (cancelled) {
            BackgroundGeolocation.removeWatcher({ id }).catch(() => {});
            return;
          }
          watcherId = id;
        })
        .catch((err: unknown) => {
          console.warn("[GPS Error][Native] watcherの登録に失敗しました:", err);
          setGpsStatus("unavailable");
          if (defaultLocation) setCurrentLocation((prev) => prev ?? defaultLocation);
        });

      // このプラグインはdistanceFilter(5m)以上動かないとコールバックが発火しない。
      // 静止中でも管理者画面/他メンバーの地図上のピンが「最新のオンライン位置」として
      // 更新され続けるよう、直近に受信済みの座標を一定間隔で再通知する
      // (新しいGPS取得ではなく、位置送信側のupdatedAtを更新させるための再送)。
      forceSendTimerRef.current = setInterval(() => {
        if (!activeRef.current) return;
        const loc = lastNativeLocRef.current;
        if (!loc) return;
        console.log("[GPS Debug][Native] 強制送信タイマー: 直近の座標を再通知します", loc);
        onFixRef.current?.(loc);
      }, FORCE_SEND_INTERVAL_MS);

      return () => {
        cancelled = true;
        activeRef.current = false;
        setShowAlwaysPermissionPrompt(false);
        if (watcherId) {
          BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(() => {});
        }
        if (forceSendTimerRef.current) {
          clearInterval(forceSendTimerRef.current);
          forceSendTimerRef.current = null;
        }
      };
    }

    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.geolocation
    ) {
      console.warn("[GPS Error] この端末/環境では位置情報が利用できません");
      setGpsStatus("unavailable");
      if (defaultLocation) setCurrentLocation(defaultLocation);
      return;
    }

    activeRef.current = true;
    gotFirstFixRef.current = false;
    permissionDeniedRef.current = false;
    retryCountRef.current = 0;
    lastFixAtRef.current = 0;
    setGpsStatus("acquiring");

    function clearWatch() {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    }

    function clearBackoffTimer() {
      if (backoffTimerRef.current) {
        clearTimeout(backoffTimerRef.current);
        backoffTimerRef.current = null;
      }
    }

    function handleFix(position: GeolocationPosition) {
      if (!activeRef.current) return;
      gotFirstFixRef.current = true;
      retryCountRef.current = 0;
      lastFixAtRef.current = Date.now();
      const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
      console.log("[GPS Debug] fix取得", loc);
      setCurrentLocation(loc);
      setGpsStatus("active");
      onFixRef.current?.(loc);
      clearBackoffTimer();
    }

    // TIMEOUT/POSITION_UNAVAILABLEの場合、追跡を中断せずバックオフしながら
    // watchPositionを再起動し続ける。権限拒否のみ再試行しても無駄なので停止する。
    function handleError(error: GeolocationPositionError) {
      if (!activeRef.current) return;
      console.warn("[GPS Error] 位置情報の取得に失敗しました:", error);

      if (error.code === error.PERMISSION_DENIED) {
        permissionDeniedRef.current = true;
        setGpsStatus("denied");
        clearWatch();
        clearBackoffTimer();
        return;
      }

      // 一度もfixを得られていない状態が続く場合のみ、UI上も明示的に「取得できていない」
      // ことを示す(既にactiveの場合は最後に取得できた位置を表示し続け、裏で再試行する)
      if (!gotFirstFixRef.current) {
        setGpsStatus("unavailable");
        if (defaultLocation) setCurrentLocation((prev) => prev ?? defaultLocation);
      }

      scheduleRetry();
    }

    // バックオフしながらwatchPositionを再起動する(TIMEOUT/POSITION_UNAVAILABLE用の
    // リカバリ処理)。段階的に間隔を延ばし、上限到達後はその間隔で再試行を続ける。
    function scheduleRetry() {
      if (permissionDeniedRef.current || !activeRef.current) return;
      clearBackoffTimer();
      const step = Math.min(retryCountRef.current, BACKOFF_STEPS_MS.length - 1);
      const delay = BACKOFF_STEPS_MS[step];
      retryCountRef.current += 1;
      console.log(`[GPS Debug] ${delay}ms後に測位を再試行します(${retryCountRef.current}回目)`);
      backoffTimerRef.current = setTimeout(() => {
        if (!activeRef.current || permissionDeniedRef.current) return;
        startWatch();
      }, delay);
    }

    function startWatch() {
      if (permissionDeniedRef.current || !activeRef.current) return;
      clearWatch();
      watchIdRef.current = navigator.geolocation.watchPosition(handleFix, handleError, WATCH_OPTIONS);
    }

    // watchPositionのイベント発火(=移動)だけに依存せず、移動の有無に関わらず
    // 一定間隔(FORCE_SEND_INTERVAL_MS)でgetCurrentPositionによる強制取得を行う。
    // 静止中でも管理者画面/他メンバーの地図上のピンが「最新のオンライン位置」として
    // 更新され続けるようにするための強制送信タイマー(iOS Safari等、バックグラウンド
    // 復帰後にwatchPositionが無言で停止したままになるケースへの保険も兼ねる)。
    function forceSend() {
      if (!activeRef.current || permissionDeniedRef.current) return;
      console.log("[GPS Debug] 強制送信タイマー: getCurrentPositionで現在地を再取得します");
      navigator.geolocation.getCurrentPosition(handleFix, handleError, WATCH_OPTIONS);
    }

    // Screen Wake Lock: 追跡中は画面が勝手にスリープしないよう保持する。
    // 未対応ブラウザ・許可されない環境でも例外を投げず、追跡自体には影響させない。
    async function requestWakeLock() {
      if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
      try {
        wakeLockRef.current = await (navigator as Navigator & {
          wakeLock: { request: (type: "screen") => Promise<WakeLockSentinel> };
        }).wakeLock.request("screen");
        console.log("[GPS Debug] Wake Lockを取得しました");
      } catch (error) {
        // 非表示タブでのリクエストなど、取得できないケースは追跡に影響しないため警告のみ
        console.warn("[GPS Debug] Wake Lockの取得に失敗しました:", error);
      }
    }

    function releaseWakeLock() {
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    }

    // Page Visibility API: バックグラウンドから復帰したタイミングでwatchPositionを
    // 再起動し、即座に現在地を再取得する。Wake Lockは非表示化で自動解放されるため
    // 復帰時に再取得する。
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible" || !activeRef.current) return;
      if (permissionDeniedRef.current) return;
      console.log("[GPS Debug] 画面がフォアグラウンドに復帰したため測位を再起動します");
      startWatch();
      navigator.geolocation.getCurrentPosition(handleFix, handleError, WATCH_OPTIONS);
      requestWakeLock();
    }

    startWatch();
    // distanceFilter相当のイベントを待たず、ONにした直後の初期座標を即座に取得する。
    navigator.geolocation.getCurrentPosition(handleFix, handleError, WATCH_OPTIONS);
    requestWakeLock();
    forceSendTimerRef.current = setInterval(forceSend, FORCE_SEND_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      activeRef.current = false;
      clearWatch();
      clearBackoffTimer();
      if (forceSendTimerRef.current) {
        clearInterval(forceSendTimerRef.current);
        forceSendTimerRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseWakeLock();
    };
    // defaultLocationはオブジェクト参照が呼び出し側で変わりうるため依存に含めない
    // (含めると毎レンダリングで追跡が再起動してしまう)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  function reportManualFix(loc: LatLng) {
    lastFixAtRef.current = Date.now();
    gotFirstFixRef.current = true;
    retryCountRef.current = 0;
    setCurrentLocation(loc);
    setGpsStatus("active");
  }

  function dismissAlwaysPermissionPrompt() {
    setShowAlwaysPermissionPrompt(false);
  }

  return {
    currentLocation,
    gpsStatus,
    reportManualFix,
    showAlwaysPermissionPrompt,
    dismissAlwaysPermissionPrompt,
  };
}
