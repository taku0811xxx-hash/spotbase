// Wikipedia(日本語版)の「周辺記事検索(geosearch)」を使って、
// 指定地点の近くにあるWikipedia記事のサムネイル画像・要約文を取得する。
// Wikipediaの記事サムネイルは、その場所の外観・看板・建物全体を写した
// 「代表写真」であることが多く、無差別に写真を集めるより関連性が高い。
//
// 注意: その場所についてWikipedia記事が存在しない(=無名の施設・住宅街など)
// 場合は何も見つからない。あくまで「参考イメージ」として扱うこと。

export type NearbyPhoto = {
  title: string;
  thumbUrl: string;
  pageUrl: string;
};

export async function fetchNearbyPhotos(
  lat: number,
  lng: number,
  radiusMeters = 800
): Promise<NearbyPhoto[]> {
  const url = new URL("https://ja.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "geosearch");
  url.searchParams.set("ggscoord", `${lat}|${lng}`);
  url.searchParams.set("ggsradius", String(radiusMeters));
  url.searchParams.set("ggslimit", "10");
  url.searchParams.set("prop", "pageimages|info");
  url.searchParams.set("piprop", "thumbnail");
  url.searchParams.set("pithumbsize", "400");
  url.searchParams.set("inprop", "url");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*"); // ブラウザからのCORSアクセスに必要

  try {
    let res: Response;
    try {
      res = await fetch(url.toString());
    } catch (fetchError) {
      // Safari の「TypeError: Load failed」などの通信エラーをキャッチ
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error("周辺写真取得 - ネットワークエラー（fetch失敗）:", {
        error: errorMessage,
        errorName: fetchError instanceof Error ? fetchError.name : "Unknown",
      });
      return [];
    }

    if (!res.ok) {
      console.error("周辺写真取得 - HTTPエラー:", { status: res.status, statusText: res.statusText });
      return [];
    }

    const data = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            title: string;
            fullurl?: string;
            thumbnail?: { source: string };
          }
        >;
      };
    };

    const pages = data.query?.pages;
    if (!pages) return [];

    return Object.values(pages)
      .filter((p) => p.thumbnail?.source)
      .map((p) => ({
        title: p.title,
        thumbUrl: p.thumbnail!.source,
        pageUrl: p.fullurl ?? `https://ja.wikipedia.org/wiki/${encodeURIComponent(p.title)}`,
      }));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("周辺写真取得に失敗:", { error: errorMessage, stack: err instanceof Error ? err.stack : undefined });
    return [];
  }
}

// Wikipedia記事の要約文を取得する(AIへの文脈情報として使用)
export async function fetchWikipediaSummary(
  lat: number,
  lng: number,
  radiusMeters = 800
): Promise<string | null> {
  const url = new URL("https://ja.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "geosearch");
  url.searchParams.set("ggscoord", `${lat}|${lng}`);
  url.searchParams.set("ggsradius", String(radiusMeters));
  url.searchParams.set("ggslimit", "1");
  url.searchParams.set("prop", "extracts");
  url.searchParams.set("exintro", "1");
  url.searchParams.set("explaintext", "1");
  url.searchParams.set("exchars", "600");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  try {
    let res: Response;
    try {
      res = await fetch(url.toString());
    } catch (fetchError) {
      // Safari の「TypeError: Load failed」などの通信エラーをキャッチ
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error("Wikipedia要約取得 - ネットワークエラー（fetch失敗）:", {
        error: errorMessage,
        errorName: fetchError instanceof Error ? fetchError.name : "Unknown",
      });
      return null;
    }

    if (!res.ok) {
      console.error("Wikipedia要約取得 - HTTPエラー:", { status: res.status, statusText: res.statusText });
      return null;
    }

    const data = (await res.json()) as {
      query?: { pages?: Record<string, { extract?: string }> };
    };
    const pages = data.query?.pages;
    if (!pages) return null;
    const first = Object.values(pages)[0];
    return first?.extract ?? null;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Wikipedia要約取得に失敗:", { error: errorMessage, stack: err instanceof Error ? err.stack : undefined });
    return null;
  }
}
