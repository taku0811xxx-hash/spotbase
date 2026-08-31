"use client";

import { useEffect, useRef, useState } from "react";

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
}

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000, // 10秒でタイムアウト判定
  maximumAge: 3000, // 3秒以内に取得済みの位置ならキャッシュを許容
};

// バックオフ再試行の間隔(ms)。TIMEOUT/POSITION_UNAVAILABLEのたびに段階的に延ばし、
// 上限に達したら以降はその間隔で再試行し続ける。
const BACKOFF_STEPS_MS = [2000, 4000, 8000, 15000];
// watchPositionのイベントに一定時間更新が無い場合、ハートビートとして
// getCurrentPositionによる強制取得を試みるまでの経過時間
const STALE_THRESHOLD_MS = 15000;
// ハートビート(定期ヘルスチェック)の実行間隔
const HEARTBEAT_INTERVAL_MS = 12000;

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

  const watchIdRef = useRef<number | null>(null);
  const backoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFixAtRef = useRef<number>(0);
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

    // watchPositionのイベント発火だけに依存せず、一定間隔で更新有無を確認し、
    // 一定時間更新が無ければgetCurrentPositionで強制的に再取得するハートビート。
    // iOS Safari等、バックグラウンド復帰後にwatchPositionが無言で停止したままに
    // なるケースへの保険。
    function heartbeat() {
      if (!activeRef.current || permissionDeniedRef.current) return;
      const elapsed = Date.now() - lastFixAtRef.current;
      if (lastFixAtRef.current !== 0 && elapsed < STALE_THRESHOLD_MS) return;
      console.log("[GPS Debug] ハートビート: 更新が滞っているためgetCurrentPositionで強制取得します");
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
    requestWakeLock();
    heartbeatTimerRef.current = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      activeRef.current = false;
      clearWatch();
      clearBackoffTimer();
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
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

  return { currentLocation, gpsStatus, reportManualFix };
}
