import { fetchNearbyOsmFeatures } from "./osmContext";
import { fetchWikipediaSummary } from "./photos";

export type ShootingSuggestion = {
  position: string;
  direction: string;
  reason: string;
};

export async function suggestShootingPositions(
  name: string,
  address: string,
  lat: number,
  lng: number,
  pinId?: string
): Promise<ShootingSuggestion[]> {
  try {
    const [osmFeatures, wikiSummary] = await Promise.all([
      fetchNearbyOsmFeatures(lat, lng),
      fetchWikipediaSummary(lat, lng),
    ]);

    let res: Response;
    try {
      res = await fetch("/api/suggest-shooting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, address, osmFeatures, wikiSummary, pinId }),
      });
    } catch (fetchError) {
      // Safari の「TypeError: Load failed」などの通信エラーをキャッチ
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error("[shootingSuggestions] ネットワークエラー（fetch失敗）:", {
        function: "suggestShootingPositions",
        error: errorMessage,
        errorName: fetchError instanceof Error ? fetchError.name : "Unknown",
        timestamp: new Date().toISOString(),
      });

      // ユーザーフレンドリーなエラーメッセージ
      const isTimeoutError =
        errorMessage.includes("timeout") ||
        errorMessage.includes("Timeout") ||
        errorMessage.includes("DEADLINE_EXCEEDED");
      const userMessage = isTimeoutError
        ? "リクエストがタイムアウトしました。接続を確認して再度お試しください。"
        : "通信エラーが発生しました。接続を確認して再度お試しください。";

      throw new Error(userMessage);
    }

    if (!res.ok) {
      let errorMessage = "撮影ポジション提案の取得に失敗しました";
      let errorDetails: Record<string, unknown> = {
        httpStatus: res.status,
        statusText: res.statusText,
      };

      try {
        const errorData = await res.json();

        // エラーレスポンスから詳細情報を抽出
        if (errorData.error) {
          errorMessage = errorData.error;
        }
        if (errorData.details) {
          errorDetails.serverDetails = errorData.details;
        }
        if (errorData.errorType) {
          errorDetails.errorType = errorData.errorType;
        }
        if (errorData.errorMessage) {
          errorDetails.errorMessage = errorData.errorMessage;
        }
      } catch (parseError) {
        // JSON パース失敗時は生テキストを保存
        try {
          const textResponse = await res.text();
          errorDetails.rawResponse = textResponse.substring(0, 500); // 最初の500文字
        } catch {
          errorDetails.rawResponse = "(レスポンスを読み込めませんでした)";
        }
        errorMessage = `撮影ポジション提案の取得に失敗しました（HTTP ${res.status}: ${res.statusText}）`;
      }

      // 詳細なエラーログを出力（デバッグ用）
      console.error("[shootingSuggestions] HTTPエラー発生:", {
        function: "suggestShootingPositions",
        message: errorMessage,
        ...errorDetails,
        timestamp: new Date().toISOString(),
      });

      throw new Error(errorMessage);
    }

    const data = await res.json();
    return data.suggestions as ShootingSuggestion[];
  } catch (err) {
    // 予期しないエラーをキャッチ（JSON パース失敗など）
    if (err instanceof Error && err.message.includes("撮影ポジション提案") || err instanceof Error && err.message.includes("通信エラー")) {
      // 既に処理済みのエラーメッセージはそのまま再 throw
      throw err;
    }

    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[shootingSuggestions] 予期しないエラー:", {
      function: "suggestShootingPositions",
      error: errorMessage,
      stack: err instanceof Error ? err.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    throw new Error("撮影ポジション提案の取得に失敗しました。管理者にお知らせください。");
  }
}
