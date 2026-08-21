/**
 * クライアント用の速報データ取得エンドポイント
 * ブラウザから直接リアルタイムでデータ取得
 */

import { NextRequest, NextResponse } from "next/server";
import { getBreakingAlerts } from "@/lib/breaking/parseLocation";

export async function GET(request: NextRequest) {
  try {
    // Firestore から未確認速報データを取得
    const alerts = await getBreakingAlerts();

    return NextResponse.json(alerts, {
      headers: {
        "Cache-Control": "public, max-age=30", // 30秒のキャッシュ（60秒ごとのクライアント更新に対応）
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error fetching breaking alerts for client:", message);

    return NextResponse.json(
      {
        error: "Failed to fetch breaking alerts",
        details: message,
      },
      { status: 500 }
    );
  }
}
