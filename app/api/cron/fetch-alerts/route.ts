/**
 * Vercel Cron エンドポイント
 * 15分ごとに実行され、Bluesky と RSS から速報情報を取得・処理
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchBlueskyAlerts, extractKeywordsFromPost } from "@/lib/breaking/blueskyFetcher";
import { fetchRssAlerts, isRelevantToAlerts } from "@/lib/breaking/rssFetcher";
import {
  extractLocationFromText,
  getCoordinatesFromLocation,
  createOrUpdateBreakingAlert,
} from "@/lib/breaking/parseLocation";

/**
 * Vercel Cron からのリクエスト判定
 */
function verifyVercelCron(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn(
      "CRON_SECRET is not set. Skipping verification for development."
    );
    return true;
  }

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  // Vercel Cron の認証チェック
  if (!verifyVercelCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("Starting breaking alerts fetch job...");

    // 並列でデータを取得
    const [blueskyPosts, rssItems] = await Promise.all([
      fetchBlueskyAlerts(25),
      fetchRssAlerts(50),
    ]);

    let processedCount = 0;
    const errors: string[] = [];

    // Bluesky 投稿を処理
    for (const post of blueskyPosts) {
      try {
        const keywords = extractKeywordsFromPost(post);
        if (keywords.length === 0) continue;

        // テキストから地名を抽出
        const locationName = extractLocationFromText(post.record.text);
        if (!locationName) {
          console.log(
            `No location found in post: "${post.record.text.substring(0, 50)}..."`
          );
          continue;
        }

        // 地名から座標を取得
        const coordinates = getCoordinatesFromLocation(locationName);
        if (!coordinates) {
          console.log(`Coordinates not found for location: "${locationName}"`);
          continue;
        }

        // アラートを作成または更新
        await createOrUpdateBreakingAlert({
          title: `Bluesky速報: ${locationName}`,
          description: post.record.text,
          keywords,
          locationName,
          lat: coordinates.lat,
          lng: coordinates.lng,
          address: locationName,
          source: "bluesky",
          sourceUrl: `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split("/").pop()}`,
          confidenceScore: 70 + Math.min(keywords.length * 5, 20), // キーワード数に基づくスコア
        });

        processedCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // 権限エラーか判定
        if (message.includes("permission-denied") || message.includes("Permission denied")) {
          errors.push(`Bluesky: Permission denied (Firestore rule issue) - ${message}`);
          console.error("Permission denied when writing to breaking_alerts collection", error);
        } else {
          errors.push(`Bluesky: ${message}`);
          console.error("Error processing Bluesky post:", error);
        }
      }
    }

    // RSS アイテムを処理
    for (const item of rssItems) {
      try {
        if (!isRelevantToAlerts(item)) continue;

        // テキストから地名を抽出
        const locationName = extractLocationFromText(
          `${item.title} ${item.description}`
        );
        if (!locationName) continue;

        // 地名から座標を取得
        const coordinates = getCoordinatesFromLocation(locationName);
        if (!coordinates) continue;

        // アラートを作成または更新
        await createOrUpdateBreakingAlert({
          title: `RSS速報: ${item.title}`,
          description: item.description.substring(0, 500), // 説明文を制限
          keywords: item.title.split(/[\s、。]/),
          locationName,
          lat: coordinates.lat,
          lng: coordinates.lng,
          address: locationName,
          source: "rss",
          sourceUrl: item.link,
          confidenceScore: 80, // RSS の信頼度はやや高め
        });

        processedCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // 権限エラーか判定
        if (message.includes("permission-denied") || message.includes("Permission denied")) {
          errors.push(`RSS: Permission denied (Firestore rule issue) - ${message}`);
          console.error("Permission denied when writing to breaking_alerts collection", error);
        } else {
          errors.push(`RSS: ${message}`);
          console.error("Error processing RSS item:", error);
        }
      }
    }

    console.log(`Completed breaking alerts job. Processed: ${processedCount}`);

    return NextResponse.json({
      success: true,
      processed: processedCount,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 権限エラーの詳細ログ
    if (message.includes("permission-denied") || message.includes("Permission denied")) {
      console.error(
        "Critical: Permission denied in breaking alerts job. " +
        "Verify Firestore rules are deployed correctly and allow server-side writes to 'breaking_alerts' collection.",
        error
      );
    } else {
      console.error("Critical error in breaking alerts job:", error);
    }

    return NextResponse.json(
      {
        error: "Failed to process breaking alerts",
        details: message,
      },
      { status: 500 }
    );
  }
}
