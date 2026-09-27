// 「ここトレ！」マイページ(app/mypage/page.tsx)専用: 自分の投稿(Exif・タグ)の傾向から、
// まだ自分が投稿していない、相性の良いスポットを提案する簡易レコメンドロジック。
// 外部のAI APIは呼ばず、集計とスコアリングだけで完結させる軽量な実装。
import type { PhotoSpot, PhotoSpotSubjectTag, PhotoSpotTimeOfDay } from "./types/photoSpot";

export type PhotoSpotRecommendation = {
  message: string; // 「広角レンズで夜景を撮ることが多いあなたには…」等のパーソナライズ文言
  spots: PhotoSpot[]; // おすすめスポット(最大3件)
};

// "24mm" のような焦点距離文字列から数値だけを取り出す
function parseFocalLengthMm(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

// 出現回数が最も多い要素を返す(同数の場合は先に登場した方)
function mostFrequent<T extends string>(values: T[]): T | null {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [v, count] of counts) {
    if (count > bestCount) {
      best = v;
      bestCount = count;
    }
  }
  return best;
}

const WIDE_ANGLE_THRESHOLD_MM = 24; // これ以下を「広角」とみなす

export function buildPhotoSpotRecommendations(
  myPosts: PhotoSpot[],
  allSpots: PhotoSpot[]
): PhotoSpotRecommendation | null {
  if (myPosts.length === 0) return null;

  const timeOfDayList = myPosts.map((p) => p.exif?.timeOfDay).filter((v): v is PhotoSpotTimeOfDay => !!v);
  const subjectTagList = myPosts.flatMap((p) => p.subjectTags ?? []);
  const focalLengths = myPosts
    .map((p) => parseFocalLengthMm(p.exif?.focalLength))
    .filter((v): v is number => v != null);

  const favoriteTimeOfDay = mostFrequent(timeOfDayList);
  const favoriteSubjectTag = mostFrequent(subjectTagList);
  const wideAngleCount = focalLengths.filter((mm) => mm <= WIDE_ANGLE_THRESHOLD_MM).length;
  const isWideAngleUser = focalLengths.length > 0 && wideAngleCount / focalLengths.length >= 0.5;

  // パーソナライズ文言を組み立てる
  const traits: string[] = [];
  if (isWideAngleUser) traits.push("広角レンズ(20mm前後)");
  if (favoriteTimeOfDay) traits.push(`${favoriteTimeOfDay}の撮影`);
  if (favoriteSubjectTag) traits.push(favoriteSubjectTag);

  const message =
    traits.length > 0
      ? `${traits.join("・")}が多いあなたには、こんなスポットもおすすめです`
      : "あなたの撮影履歴から、こんなスポットもおすすめです";

  // 自分がまだ投稿していないスポットの中から、傾向に合うものをスコアリング
  const myPostedSpotIds = new Set(myPosts.map((p) => p.id));
  const candidates = allSpots.filter((s) => !myPostedSpotIds.has(s.id));

  function score(spot: PhotoSpot): number {
    let s = 0;
    if (favoriteTimeOfDay && spot.exif?.timeOfDay === favoriteTimeOfDay) s += 2;
    if (favoriteSubjectTag && (spot.subjectTags ?? []).includes(favoriteSubjectTag)) s += 2;
    if (isWideAngleUser) {
      const mm = parseFocalLengthMm(spot.exif?.focalLength);
      if (mm != null && mm <= WIDE_ANGLE_THRESHOLD_MM) s += 1;
    }
    return s;
  }

  const ranked = candidates
    .map((spot) => ({ spot, score: score(spot) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r) => r.spot);

  if (ranked.length === 0) return null;

  return { message, spots: ranked };
}

// マイページのプロフィールヘッダーで使う「よく使う愛機」の判定(投稿数が最も多いカメラ機種)
export function mostUsedCamera(myPosts: PhotoSpot[]): string | null {
  const cameras = myPosts.map((p) => p.cameraGear?.camera).filter((v): v is string => !!v);
  return mostFrequent(cameras);
}

export type { PhotoSpotSubjectTag };
