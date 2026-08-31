// Anthropic(Claude)モデル指定の共通ロジック。
//
// 方針:
// - 日付固定のモデルID(例: claude-3-5-haiku-20241022)をコードに直接書かない。
//   Anthropic側でモデルが廃止されると404 not_found_errorの原因になるため。
// - プライマリはHaikuシリーズの「ローリングエイリアス」を使う。エイリアスは
//   Anthropic側でモデルが更新されると自動的に最新版を指すため、コード変更不要で
//   追従できる。
//   (注: claude-3-5-haiku-latest / claude-3-haiku-latest / claude-3-haiku-20240307 は
//    このAPIキーの利用可能モデルではすでに廃止(404 not_found_error)されていることを
//    実機確認済みのため、現行世代のHaikuローリングエイリアスに置き換えている)
// - プライマリが404/エラーの場合のみ、Haikuシリーズ限定でセカンダリへフォールバックする。
//   Sonnet/Opus等の高額モデルへは絶対にフォールバックしない(コスト保護)。

export const PRIMARY_HAIKU_MODEL = "claude-haiku-4-5";
export const DEFAULT_FALLBACK_HAIKU_MODEL = "claude-haiku-4-5-20251001";

// コスト保護ガード: 「haiku」を含むモデルIDのみ許可する。
// 環境変数に誤ってsonnet/opus系のIDが設定された場合でも、
// 高額モデルへは絶対に自動切替(昇格)しない。
export function isHaikuModel(modelId: string): boolean {
  return /haiku/i.test(modelId);
}

// ANTHROPIC_MODEL環境変数でプライマリを上書きしたい場合も、Haikuシリーズ以外は
// コスト保護のため無視し、ローリングエイリアスにフォールバックする。
export function resolvePrimaryModel(): string {
  const override = process.env.ANTHROPIC_MODEL;
  if (override && !isHaikuModel(override)) {
    console.error(
      `[MODEL WARNING] ANTHROPIC_MODEL(${override})はHaikuシリーズではないため無視し、` +
        `既定のHaikuモデル(${PRIMARY_HAIKU_MODEL})を使用します(コスト保護)。`
    );
    return PRIMARY_HAIKU_MODEL;
  }
  return override || PRIMARY_HAIKU_MODEL;
}

// FALLBACK_HAIKU_MODEL環境変数も同様にHaikuシリーズ以外は無視する。
export function resolveFallbackModel(): string {
  const override = process.env.FALLBACK_HAIKU_MODEL;
  if (override && !isHaikuModel(override)) {
    console.error(
      `[MODEL WARNING] FALLBACK_HAIKU_MODEL(${override})はHaikuシリーズではないため無視し、` +
        `既定のフォールバックモデル(${DEFAULT_FALLBACK_HAIKU_MODEL})を使用します(コスト保護)。`
    );
    return DEFAULT_FALLBACK_HAIKU_MODEL;
  }
  return override || DEFAULT_FALLBACK_HAIKU_MODEL;
}

export type AnthropicCallResult =
  | { success: true; data: string; model: string }
  | { success: false; error: string; status?: number };

// Anthropic Messages APIを、Haikuシリーズ限定のプライマリ→フォールバックの
// 二重化構成で呼び出す共通ヘルパー。
// - プライマリ(resolvePrimaryModel())で404/5xx/その他のエラーが出た場合のみ、
//   Haikuシリーズのセカンダリ(resolveFallbackModel())へ自動リトライする。
// - Sonnet/Opus等へは絶対に昇格しない(isHaikuModelで両モデルとも保証済み)。
// - フォールバックが発生した場合は"[MODEL WARNING]"を含む目立つログを出力する。
export async function callAnthropicWithHaikuFallback(params: {
  apiKey: string;
  prompt: string;
  maxTokens: number;
  endpoint: string; // ログ用のエンドポイント名(例: "/api/suggest-shooting")
}): Promise<AnthropicCallResult> {
  const { apiKey, prompt, maxTokens, endpoint } = params;
  const primaryModel = resolvePrimaryModel();
  const fallbackModel = resolveFallbackModel();
  const candidates = isHaikuModel(fallbackModel) && fallbackModel !== primaryModel
    ? [primaryModel, fallbackModel]
    : [primaryModel];

  let lastErrorMessage = "要約の生成に失敗しました。しばらく時間を置いてお試しください。";
  let lastStatus: number | undefined;

  for (let i = 0; i < candidates.length; i++) {
    const currentModel = candidates[i];
    const isLastCandidate = i === candidates.length - 1;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: currentModel,
          max_tokens: maxTokens,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(
          `[AI Generation Error] endpoint=${endpoint} model=${currentModel} status=${res.status} statusText=${res.statusText} body=${text.substring(0, 500)}`
        );

        lastStatus = res.status;
        lastErrorMessage =
          res.status === 401
            ? "APIキーが無効です"
            : res.status === 429
              ? "リクエスト制限に達しました。しばらく待ってからお試しください"
              : res.status >= 500
                ? "Anthropic API サーバーエラーが発生しました。しばらく待ってからお試しください"
                : "AI提案の生成に失敗しました。しばらく時間を置いてお試しください。";

        if (!isLastCandidate) {
          console.error(
            "[MODEL WARNING] Primary Haiku model failed. Switched to fallback model."
          );
          continue;
        }
        return { success: false, error: lastErrorMessage, status: lastStatus };
      }

      const data = await res.json();
      const text: string =
        data.content
          ?.map((block: { type: string; text?: string }) =>
            block.type === "text" ? block.text : ""
          )
          .join("") ?? "";

      if (!text.trim()) {
        console.error(
          `[AI Generation Error] endpoint=${endpoint} model=${currentModel} reason=AIの応答が空でした response=${JSON.stringify(data).substring(0, 500)}`
        );
        lastErrorMessage = "AIの応答が空でした。しばらく時間を置いてお試しください。";
        if (!isLastCandidate) {
          console.error(
            "[MODEL WARNING] Primary Haiku model failed. Switched to fallback model."
          );
          continue;
        }
        return { success: false, error: lastErrorMessage };
      }

      return { success: true, data: text, model: currentModel };
    } catch (err) {
      const message = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : String(err);
      console.error(`[AI Generation Error] endpoint=${endpoint} model=${currentModel}\n${message}`);
      lastErrorMessage = "AI提案の生成中に予期しないエラーが発生しました。サーバーログを確認してください。";

      if (!isLastCandidate) {
        console.error(
          "[MODEL WARNING] Primary Haiku model failed. Switched to fallback model."
        );
        continue;
      }
      return { success: false, error: lastErrorMessage };
    }
  }

  return { success: false, error: lastErrorMessage, status: lastStatus };
}
