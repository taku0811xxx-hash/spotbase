import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

export type BroadcastLocationSuggestion = {
  recommended: {
    name: string;
    lat: number;
    lng: number;
    reason: string; // 最大40文字
    iconType: "angle" | "parking";
  };
  alternative: {
    name: string;
    lat: number;
    lng: number;
    reason: string;
    iconType: "angle" | "parking";
  };
  parking: {
    name: string;
    lat: number;
    lng: number;
    reason: string;
    iconType: "angle" | "parking";
  };
};

// Anthropic API 呼び出しヘルパー関数（フォールバック処理付き）
async function callAnthropicAPI(
  apiKey: string,
  model: string,
  prompt: string
): Promise<{ success: boolean; data?: string; error?: string }> {
  const models = [model, "claude-3-haiku-20240307"]; // フォールバックモデル

  for (const currentModel of models) {
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
          max_tokens: 500,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        let errorInfo = { type: "", message: "" };

        try {
          const errorData = JSON.parse(text);
          errorInfo.type = errorData.error?.type || "unknown";
          errorInfo.message = errorData.error?.message || errorData.message || text;
        } catch {
          errorInfo.message = text.substring(0, 200);
        }

        // 404/400 エラーで現在のモデルがテスト用の場合、フォールバック
        if (
          (res.status === 404 || res.status === 400) &&
          currentModel === model &&
          models.length > 1
        ) {
          console.warn(
            `[suggest-locations] モデル「${currentModel}」が利用不可。フォールバックモデルで再試行します。`,
            { status: res.status, error: errorInfo }
          );
          continue; // 次のモデルで再試行
        }

        // それ以外のエラーはここで終了
        console.error("AI Generation Error - API Response Failed:", {
          status: res.status,
          statusText: res.statusText,
          errorType: errorInfo.type,
          errorMessage: errorInfo.message,
          model: currentModel,
          endpoint: "/api/suggest-locations",
        });

        const userMessage =
          res.status === 401
            ? "APIキーが無効です"
            : res.status === 429
              ? "リクエスト制限に達しました。しばらく待ってからお試しください"
              : res.status >= 500
                ? "Anthropic API サーバーエラーが発生しました。しばらく待ってからお試しください"
                : "放送位置のスコアリングに失敗しました。しばらく時間を置いてお試しください。";

        return { success: false, error: userMessage };
      }

      const data = await res.json();
      const text = data.content
        ?.map((block: { type: string; text?: string }) =>
          block.type === "text" ? block.text : ""
        )
        .join("") ?? "";

      return { success: true, data: text };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("AI Generation Error - Exception:", {
        model: currentModel,
        error: errorMessage,
        endpoint: "/api/suggest-locations",
      });

      // フォールバックがある場合は次を試す
      if (currentModel !== models[models.length - 1]) {
        continue;
      }

      return {
        success: false,
        error: "放送位置のスコアリングに失敗しました。サーバーログを確認してください。",
      };
    }
  }

  return {
    success: false,
    error: "すべてのモデルで放送位置スコアリングに失敗しました。",
  };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";

  if (!apiKey) {
    console.error("AI Generation Error - Missing API Key:", {
      endpoint: "/api/suggest-locations",
      missingKey: "ANTHROPIC_API_KEY",
    });
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が .env.local に設定されていません。管理者にご連絡ください。" },
      { status: 500 }
    );
  }

  const { candidates, incidentType, address, pinId } = await req.json();

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return NextResponse.json(
      { error: "候補地点がありません" },
      { status: 400 }
    );
  }

  // 候補データを簡潔に整形
  const candidatesText = candidates
    .map(
      (c: { name: string; lat: number; lng: number; type: string; reason: string }, i: number) =>
        `${i + 1}. ${c.name}(${c.type}) - ${c.reason}`
    )
    .join("\n");

  const prompt = `放送中継の最適地点を選んでください。

【現場情報】
事象: ${incidentType}
住所: ${address}

【候補地点】
${candidatesText}

以下のJSONのみで返してください。理由は40字以内にしてください。
{
  "recommended": {"name": "string", "lat": number, "lng": number, "reason": "40字以内", "iconType": "angle"|"parking"},
  "alternative": {"name": "string", "lat": number, "lng": number, "reason": "40字以内", "iconType": "angle"|"parking"},
  "parking": {"name": "string", "lat": number, "lng": number, "reason": "40字以内", "iconType": "parking"}
}`;

  try {
    // ヘルパー関数でAPI呼び出し（フォールバック処理付き）
    const result = await callAnthropicAPI(apiKey, model, prompt);

    if (!result.success) {
      console.error("API Suggestion Failed:", {
        error: result.error,
        endpoint: "/api/suggest-locations",
      });
      return NextResponse.json(
        { error: result.error, errorType: "api_failure" },
        { status: 500 }
      );
    }

    const text = result.data || "";

    // JSON パース前に応答をログ出力
    console.log("API Response (raw):", {
      length: text.length,
      preview: text.substring(0, 100),
      endpoint: "/api/suggest-locations",
    });

    const cleaned = text.replace(/```json|```/g, "").trim();

    // JSON パース失敗のハンドリング
    let suggestion: BroadcastLocationSuggestion;
    try {
      suggestion = JSON.parse(cleaned) as BroadcastLocationSuggestion;
    } catch (parseErr) {
      const errorMessage = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.error("JSON Parse Error:", {
        error: errorMessage,
        rawText: text.substring(0, 500),
        cleaned: cleaned.substring(0, 500),
        endpoint: "/api/suggest-locations",
      });
      return NextResponse.json(
        {
          error: "放送位置スコアリング結果の形式が不正です。AIからの返却データが正しくありません。",
          errorType: "json_parse_error",
          details: errorMessage,
        },
        { status: 500 }
      );
    }

    // 必須フィールドの確認
    if (!suggestion.recommended || !suggestion.alternative || !suggestion.parking) {
      console.error("Invalid Response Format:", {
        hasRecommended: !!suggestion.recommended,
        hasAlternative: !!suggestion.alternative,
        hasParking: !!suggestion.parking,
        endpoint: "/api/suggest-locations",
      });
      return NextResponse.json(
        {
          error: "放送位置スコアリング結果が不完全です。",
          errorType: "format_error",
        },
        { status: 500 }
      );
    }

    // Firestore にキャッシュを保存
    if (pinId) {
      try {
        const db = getAdminDb();
        await db.collection("pins").doc(pinId).update({
          "aiProposal.content.broadcastLocations": suggestion,
          "aiProposal.generatedAt": Timestamp.now(),
        });
      } catch (saveErr) {
        console.error("AI Generation Error - Failed to save cache:", {
          error: saveErr instanceof Error ? saveErr.message : String(saveErr),
          pinId,
          endpoint: "/api/suggest-locations",
        });
        // キャッシュ保存失敗は提案返却の邪魔はしない
      }
    }

    console.log("Successfully generated location suggestions:", {
      endpoint: "/api/suggest-locations",
    });

    return NextResponse.json({ suggestion });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;

    console.error("AI Generation Error - Exception:", {
      error: errorMessage,
      errorStack,
      endpoint: "/api/suggest-locations",
    });

    // タイムアウトとその他のエラーを区別
    const isTimeout = errorMessage.includes("timeout") || errorMessage.includes("DEADLINE_EXCEEDED");
    const userMessage = isTimeout
      ? "リクエストがタイムアウトしました。ネットワーク接続を確認してからお試しください。"
      : "放送位置のスコアリングに失敗しました。サーバーログを確認してください。";

    return NextResponse.json(
      { error: userMessage, details: errorMessage, errorType: "exception" },
      { status: 500 }
    );
  }
}
