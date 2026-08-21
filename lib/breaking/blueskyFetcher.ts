/**
 * Bluesky のパブリック API を使用して速報キーワードを含む投稿を取得
 * 認証なしで動作するため、自由に速報情報を集約できます
 */

export type BlueskyPost = {
  uri: string;
  cid: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
  };
  record: {
    text: string;
    createdAt: string;
  };
  indexedAt: string;
};

const BLUESKY_API_BASE = "https://public.api.bsky.app/xrpc";

// 速報関連キーワード（日本語の速報・事故・火事・交通問題など）
const ALERT_KEYWORDS = [
  "火事",
  "火災",
  "事故",
  "交通事故",
  "入場制限",
  "運転見合わせ",
  "遅延",
  "停止",
  "閉鎖",
  "復旧",
  "警報",
  "注意報",
  "地震",
  "津波",
  "大雨",
  "暴風",
  "警察",
  "消防",
  "救急",
  "通行止め",
  "渋滞",
  "バス運休",
  "列車運休",
  "電車遅延",
];

/**
 * Bluesky から速報キーワードを含む最新投稿を取得
 * @param limit 取得件数（デフォルト: 25）
 * @returns BlueskyPost[]
 */
export async function fetchBlueskyAlerts(limit: number = 25): Promise<BlueskyPost[]> {
  try {
    // 複数のキーワードで検索を行い、結果をマージ
    const allPosts: BlueskyPost[] = [];
    const seenUris = new Set<string>();

    // キーワードごとに検索
    for (const keyword of ALERT_KEYWORDS) {
      try {
        const response = await fetch(
          `${BLUESKY_API_BASE}/app.bsky.feed.searchPosts?q=${encodeURIComponent(
            keyword
          )}&limit=10&sort=latest`,
          {
            headers: {
              "Accept": "application/json",
            },
          }
        );

        if (!response.ok) {
          console.warn(`Bluesky API error for keyword "${keyword}":`, response.status);
          continue;
        }

        const data = await response.json() as { posts?: BlueskyPost[] };
        if (data.posts) {
          for (const post of data.posts) {
            if (!seenUris.has(post.uri)) {
              seenUris.add(post.uri);
              allPosts.push(post);
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching Bluesky posts for "${keyword}":`, error);
        continue;
      }

      // API レート制限を考慮して小休止
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // 新しい投稿順にソート
    return allPosts
      .sort(
        (a, b) =>
          new Date(b.indexedAt).getTime() - new Date(a.indexedAt).getTime()
      )
      .slice(0, limit);
  } catch (error) {
    console.error("Failed to fetch Bluesky alerts:", error);
    return [];
  }
}

/**
 * 投稿テキストからキーワードを抽出
 */
export function extractKeywordsFromPost(post: BlueskyPost): string[] {
  const text = post.record.text.toLowerCase();
  return ALERT_KEYWORDS.filter((keyword) => text.includes(keyword.toLowerCase()));
}
