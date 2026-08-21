/**
 * テキストから地名を抽出し、座標を取得
 * 位置情報に基づいて未確認速報ピンを Firestore に保存
 */

import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  doc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { distance, point } from "@turf/turf";

export type BreakingAlert = {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  lat: number;
  lng: number;
  locationName: string;
  address: string;
  source: "bluesky" | "rss";
  status: "unverified" | "verified" | "dismissed";
  count: number; // 同一エリアでの報告数
  confidenceScore: number; // 信頼度スコア（0-100）
  createdAt: Timestamp;
  updatedAt: Timestamp;
  sourceUrls: string[];
};

/**
 * 日本の主要都市・地域の座標辞書
 * 速報情報の位置情報として実際に利用される東京・大阪・主要駅などに限定
 * ※ 他の地域からのリクエストは、テキスト解析で地名が抽出されない場合、
 *    スキップされるため、辞書に無い地域は自動的に処理対象外になります
 */
const LOCATION_DICTIONARY: Record<string, { lat: number; lng: number }> = {
  // 東京都（中心部・繁華街・駅周辺）
  "千代田区": { lat: 35.6762, lng: 139.7645 },
  "港区": { lat: 35.6266, lng: 139.7503 },
  "新宿区": { lat: 35.6895, lng: 139.7005 },
  "渋谷区": { lat: 35.6595, lng: 139.7004 },
  "品川区": { lat: 35.6281, lng: 139.7393 },

  // 大阪府（中心部）
  "大阪市北区": { lat: 34.6954, lng: 135.5023 },
  "大阪市中央区": { lat: 34.6765, lng: 135.5069 },

  // 主要駅・施設（全国対応）
  "渋谷駅": { lat: 35.6595, lng: 139.7004 },
  "新宿駅": { lat: 35.6895, lng: 139.7005 },
  "東京駅": { lat: 35.6812, lng: 139.7671 },
  "品川駅": { lat: 35.6281, lng: 139.7393 },
  "大阪駅": { lat: 34.7024, lng: 135.4959 },
  "京都駅": { lat: 34.7755, lng: 135.7537 },
};

/**
 * テキストから地名を抽出
 */
export function extractLocationFromText(text: string): string | null {
  // 正規表現で「〇〇区」「〇〇駅」など地名パターンを抽出
  const locationPatterns = [
    /([東西南北]?[0-9一二三四五六七八九十]?[市区町村])/g,
    /([都道府県名][市区町村名]?)/g,
    /([ァ-ヴー々々ゝゞ一-龯]*[駅]*)/g,
  ];

  for (const pattern of locationPatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      // 辞書に存在する地名を返す
      for (const match of matches) {
        if (LOCATION_DICTIONARY[match]) {
          return match;
        }
      }
    }
  }

  return null;
}

/**
 * 地名から座標を取得
 */
export function getCoordinatesFromLocation(
  locationName: string
): { lat: number; lng: number } | null {
  return LOCATION_DICTIONARY[locationName] || null;
}

/**
 * 重複チェック：直近30分以内の同一エリア（半径500m）でのアラートを検索
 * コレクションが存在しない場合や、クエリエラーが発生した場合は null を返す（新規作成に進む）
 */
export async function checkDuplicateAlert(
  lat: number,
  lng: number,
  keyword: string
): Promise<BreakingAlert | null> {
  try {
    const now = new Date();
    const thirtyMinutesAgo = new Timestamp(
      Math.floor(now.getTime() / 1000) - 30 * 60,
      0
    );

    const q = query(
      collection(db, "breaking_alerts"),
      where("createdAt", ">=", thirtyMinutesAgo),
      where("keywords", "array-contains", keyword)
    );

    const snap = await getDocs(q);

    // snap.docs が空の場合は null を返す（重複なし）
    if (snap.empty) {
      return null;
    }

    // 同一エリア（半径500m以内）のアラートを検索
    for (const doc_ of snap.docs) {
      const alert = doc_.data() as BreakingAlert;
      const dist = distance(
        point([lng, lat]),
        point([alert.lng, alert.lat]),
        { units: "kilometers" }
      );

      // distance は km 単位で返される
      if (dist < 0.5) {
        // 500m = 0.5km
        return { ...alert, id: doc_.id };
      }
    }

    // 条件に合致するアラートが見つからない
    return null;
  } catch (error) {
    // breaking_alerts コレクションが存在しない場合も含め、
    // エラーは null で返す（新規作成処理に進む）
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Checking duplicate alerts returned null (likely empty collection): ${message}`);
    return null;
  }
}

/**
 * 未確認速報ピンを Firestore に保存または既存の場合はカウントをインクリメント
 */
export async function createOrUpdateBreakingAlert(input: {
  title: string;
  description: string;
  keywords: string[];
  locationName: string;
  lat: number;
  lng: number;
  address: string;
  source: "bluesky" | "rss";
  sourceUrl: string;
  confidenceScore: number;
}): Promise<string> {
  try {
    // 重複チェック（最初のキーワードで検索）
    const keyword = input.keywords[0];
    const duplicate = await checkDuplicateAlert(
      input.lat,
      input.lng,
      keyword
    );

    if (duplicate) {
      // 既存のアラートを更新：カウント + 信頼度スコアをインクリメント
      await updateDoc(doc(db, "breaking_alerts", duplicate.id), {
        count: (duplicate.count || 1) + 1,
        confidenceScore: Math.min(
          100,
          (duplicate.confidenceScore + input.confidenceScore) / 2 + 5
        ),
        updatedAt: Timestamp.now(),
        sourceUrls: [
          ...new Set([...duplicate.sourceUrls, input.sourceUrl]),
        ],
      });

      console.log(
        `Updated existing alert (ID: ${duplicate.id}) for "${input.locationName}"`
      );
      return duplicate.id;
    }

    // 新規作成
    const newAlertRef = doc(collection(db, "breaking_alerts"));
    const newAlert: Omit<BreakingAlert, "id"> = {
      title: input.title,
      description: input.description,
      keywords: input.keywords,
      locationName: input.locationName,
      lat: input.lat,
      lng: input.lng,
      address: input.address,
      source: input.source,
      status: "unverified",
      count: 1,
      confidenceScore: input.confidenceScore,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      sourceUrls: [input.sourceUrl],
    };

    await setDoc(newAlertRef, newAlert);

    console.log(
      `Created new breaking alert (ID: ${newAlertRef.id}) for "${input.locationName}"`
    );
    return newAlertRef.id;
  } catch (error) {
    // Firestore 権限エラーの詳細ログ
    if (error instanceof Error) {
      if (
        error.message.includes("permission-denied") ||
        error.message.includes("Permission denied")
      ) {
        console.error(
          `Permission denied when creating/updating breaking alert for "${input.locationName}". ` +
          `Ensure Firestore rules are properly deployed and allow writes to 'breaking_alerts' collection.`,
          error.message
        );
      } else {
        console.error(
          `Error creating/updating breaking alert for "${input.locationName}":`,
          error.message
        );
      }
    } else {
      console.error("Error creating/updating breaking alert:", error);
    }
    throw error;
  }
}

/**
 * すべての未確認速報アラートを取得
 * - breaking_alerts コレクションが存在しない場合 → 空配列を返す
 * - 権限エラー → 空配列を返し、警告ログを出力
 * - その他のエラー → 空配列を返し、エラーログを出力
 *
 * **UI がクラッシュしないことを保証します**
 */
export async function getBreakingAlerts(): Promise<BreakingAlert[]> {
  try {
    const q = query(
      collection(db, "breaking_alerts"),
      where("status", "==", "unverified")
    );
    const snap = await getDocs(q);

    // snap が空の場合は空配列を返す（正常系）
    if (snap.empty) {
      console.log("No breaking alerts found (breaking_alerts collection may be empty)");
      return [];
    }

    const alerts = snap.docs.map((doc_) => ({
      id: doc_.id,
      ...doc_.data(),
    } as BreakingAlert));

    console.log(`Fetched ${alerts.length} breaking alerts`);
    return alerts;
  } catch (error) {
    // あらゆるエラーが発生しても安全に復旧
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("permission-denied") || message.includes("Permission denied")) {
      console.warn(
        "Breaking alerts: Permission denied - Firestore rules may not be properly deployed. " +
        "Returning empty array to prevent UI crash.",
        message
      );
    } else if (message.includes("not_found") || message.includes("Not found")) {
      // breaking_alerts コレクションが存在しない場合
      console.info("Breaking alerts collection does not exist yet. Returning empty array.");
    } else {
      console.error("Error fetching breaking alerts:", message);
    }

    // すべてのエラーケースで安全に空配列を返す
    return [];
  }
}
