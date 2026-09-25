"use client";

import { useEffect, useState } from "react";
import type { BreakingAlert } from "@/lib/breaking/parseLocation";
import { APP_MODE } from "@/lib/config";

/**
 * クライアント側で速報データをリアルタイム取得するカスタムフック
 * 60秒ごとに自動更新
 *
 * "/api/breaking-alerts" はSpotBase本体(pro)専用のサーバーAPIで、
 * 「ここトレ！」(photo)のCapacitor静的書き出しビルドには含まれない
 * (scripts/build-photo.mjsがapp/apiをビルドから除外するため)。
 * proモード以外でも常時実行すると、iOSアプリではWebViewの読み込み先
 * (capacitor://localhost)に存在しないパスへ相対fetchすることになり、
 * 初回表示中に例外(WKWebView上で「The string did not match the
 * expected pattern」等)が発生して画面がフリーズしうるため、
 * proモード以外では最初からフェッチしない。
 */
export function useBreakingAlerts() {
  const [alerts, setAlerts] = useState<BreakingAlert[]>([]);
  const [loading, setLoading] = useState(APP_MODE === "pro");
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = async () => {
    try {
      setError(null);
      const response = await fetch("/api/breaking-alerts", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch alerts: ${response.status}`);
      }

      const data = await response.json();
      setAlerts(Array.isArray(data) ? data : data.alerts || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Error fetching breaking alerts:", message);
      setError(message);
      // エラー時も空配列で安全に復旧
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // SpotBase本体(pro)以外では速報APIを持たないため何もしない
    if (APP_MODE !== "pro") return;

    // マウント時に初回フェッチ
    fetchAlerts();

    // 60秒ごとに自動更新
    const interval = setInterval(fetchAlerts, 60 * 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return { alerts, loading, error };
}
