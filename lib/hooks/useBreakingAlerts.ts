"use client";

import { useEffect, useState } from "react";
import type { BreakingAlert } from "@/lib/breaking/parseLocation";

/**
 * クライアント側で速報データをリアルタイム取得するカスタムフック
 * 60秒ごとに自動更新
 */
export function useBreakingAlerts() {
  const [alerts, setAlerts] = useState<BreakingAlert[]>([]);
  const [loading, setLoading] = useState(true);
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
