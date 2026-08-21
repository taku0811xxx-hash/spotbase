/**
 * RSS フィードから防災・交通ニュースを取得
 * Yahoo!ニュース速報 RSS などから情報を集約
 */

import Parser from "rss-parser";

export type RssFeedItem = {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: string;
};

// RSS フィード URL リスト（完全無料のパブリック RSS）
const RSS_FEEDS = [
  // Yahoo!ニュース速報（いくつかのカテゴリ）
  "https://news.yahoo.co.jp/rss/topics/top.xml",
  // NHK ニュース速報
  "https://www.nhk.or.jp/rss/news/rss.xml",
  // 日本気象協会（防災気象情報）
  "https://www.jma.go.jp/rss/",
  // Google ニュース（公式 RSS がある場合）
  // 注: Google ニュースの RSS は廃止済みの場合が多いため別の情報源を検討
];

const parser = new Parser({
  timeout: 5000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; SpotBase/1.0; +https://spotbase.example.com)",
  },
});

/**
 * RSS フィードから防災・交通関連のニュースを取得
 * @param limit 取得件数（デフォルト: 50）
 * @returns RssFeedItem[]
 */
export async function fetchRssAlerts(limit: number = 50): Promise<RssFeedItem[]> {
  const allItems: RssFeedItem[] = [];

  for (const feedUrl of RSS_FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);
      const source = new URL(feedUrl).hostname || feedUrl;

      if (feed.items) {
        for (const item of feed.items) {
          allItems.push({
            title: item.title || "",
            description: item.content || item.description || "",
            link: item.link || "",
            pubDate: item.pubDate || new Date().toISOString(),
            source,
          });
        }
      }
    } catch (error) {
      console.error(`Error fetching RSS feed from ${feedUrl}:`, error);
      // エラーが発生しても他のフィードの処理は継続
      continue;
    }
  }

  // 新しい記事順にソート
  return allItems
    .sort(
      (a, b) =>
        new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
    )
    .slice(0, limit);
}

/**
 * RSS アイテムが防災・交通関連かどうかをフィルタ
 */
export function isRelevantToAlerts(item: RssFeedItem): boolean {
  const text = `${item.title} ${item.description}`.toLowerCase();

  const relevantKeywords = [
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
    "災害",
    "被害",
  ];

  return relevantKeywords.some((keyword) =>
    text.includes(keyword.toLowerCase())
  );
}
