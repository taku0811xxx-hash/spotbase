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

// 日本の主要都市・地名辞書（緯度・経度のペア）
const LOCATION_DICTIONARY: Record<string, { lat: number; lng: number }> = {
  // 東京都
  "千代田区": { lat: 35.6762, lng: 139.7645 },
  "中央区": { lat: 35.6661, lng: 139.7733 },
  "港区": { lat: 35.6266, lng: 139.7503 },
  "新宿区": { lat: 35.6895, lng: 139.7005 },
  "文京区": { lat: 35.7101, lng: 139.7637 },
  "台東区": { lat: 35.7148, lng: 139.7838 },
  "墨田区": { lat: 35.7307, lng: 139.8062 },
  "江東区": { lat: 35.6454, lng: 139.8156 },
  "品川区": { lat: 35.6281, lng: 139.7393 },
  "目黒区": { lat: 35.6336, lng: 139.7154 },
  "大田区": { lat: 35.5659, lng: 139.7296 },
  "世田谷区": { lat: 35.6437, lng: 139.6483 },
  "渋谷区": { lat: 35.6595, lng: 139.7004 },
  "中野区": { lat: 35.7052, lng: 139.6656 },
  "杉並区": { lat: 35.7036, lng: 139.6346 },
  "豊島区": { lat: 35.7307, lng: 139.7155 },
  "北区": { lat: 35.7497, lng: 139.7252 },
  "荒川区": { lat: 35.7506, lng: 139.8048 },
  "板橋区": { lat: 35.7473, lng: 139.6958 },
  "練馬区": { lat: 35.7345, lng: 139.6159 },
  "足立区": { lat: 35.7807, lng: 139.8113 },
  "葛飾区": { lat: 35.7627, lng: 139.8462 },
  "江戸川区": { lat: 35.7345, lng: 139.8857 },

  // 大阪府
  "大阪市北区": { lat: 34.6954, lng: 135.5023 },
  "大阪市中央区": { lat: 34.6765, lng: 135.5069 },
  "大阪市城東区": { lat: 34.6599, lng: 135.5358 },
  "大阪市鶴見区": { lat: 34.6847, lng: 135.5585 },
  "大阪市東住吉区": { lat: 34.6207, lng: 135.5406 },
  "大阪市平野区": { lat: 34.5862, lng: 135.5297 },
  "大阪市南区": { lat: 34.6558, lng: 135.5053 },
  "大阪市住吉区": { lat: 34.5973, lng: 135.4937 },
  "大阪市西区": { lat: 34.6847, lng: 135.4845 },
  "大阪市港区": { lat: 34.6474, lng: 135.4476 },
  "大阪市生野区": { lat: 34.6818, lng: 135.5516 },
  "大阪市旭区": { lat: 34.5903, lng: 135.5723 },
  "大阪市淀川区": { lat: 34.7407, lng: 135.5051 },
  "大阪市東成区": { lat: 34.6737, lng: 135.5508 },
  "大阪市西成区": { lat: 34.6179, lng: 135.4755 },
  "大阪市都島区": { lat: 34.7149, lng: 135.5283 },
  "大阪市此花区": { lat: 34.7154, lng: 135.4531 },
  "大阪市浪速区": { lat: 34.6569, lng: 135.4975 },
  "大阪市福島区": { lat: 34.7086, lng: 135.5052 },
  "大阪市阿倍野区": { lat: 34.5969, lng: 135.5052 },
  "大阪市住之江区": { lat: 34.5854, lng: 135.4726 },
  "大阪市西淀川区": { lat: 34.7379, lng: 135.4814 },
  "大阪市東淀川区": { lat: 34.7568, lng: 135.5361 },

  // 有名施設・ランドマーク
  "国立競技場": { lat: 35.6762, lng: 139.7151 },
  "渋谷駅": { lat: 35.6595, lng: 139.7004 },
  "新宿駅": { lat: 35.6895, lng: 139.7005 },
  "東京駅": { lat: 35.6812, lng: 139.7671 },
  "成田空港": { lat: 35.7653, lng: 140.3925 },
  "羽田空港": { lat: 35.5494, lng: 139.7798 },
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

    return null;
  } catch (error) {
    console.error("Error checking duplicate alerts:", error);
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
    console.error("Error creating/updating breaking alert:", error);
    throw error;
  }
}

/**
 * すべての未確認速報アラートを取得
 */
export async function getBreakingAlerts(): Promise<BreakingAlert[]> {
  try {
    const q = query(
      collection(db, "breaking_alerts"),
      where("status", "==", "unverified")
    );
    const snap = await getDocs(q);
    return snap.docs.map((doc_) => ({
      id: doc_.id,
      ...doc_.data(),
    } as BreakingAlert));
  } catch (error) {
    console.error("Error fetching breaking alerts:", error);
    return [];
  }
}
