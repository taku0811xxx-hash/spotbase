import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { callAnthropicWithHaikuFallback } from "@/lib/anthropicModel";

export type ShootingSuggestion = {
  position: string; // どこから撮るか
  direction: string; // 方角・向き
  reason: string; // 理由
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error("AI Generation Error - Missing API Key:", {
      endpoint: "/api/suggest-shooting",
      missingKey: "ANTHROPIC_API_KEY",
    });
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が .env.local に設定されていません。管理者にご連絡ください。" },
      { status: 500 }
    );
  }

  const { name, address, osmFeatures, wikiSummary, pinId } = await req.json();

  const featuresText =
    Array.isArray(osmFeatures) && osmFeatures.length > 0
      ? osmFeatures
          .map(
            (f: { name: string; type: string; distanceMeters: number; bearingLabel: string }) =>
              `- ${f.name}(${f.type}): 現場から${f.bearingLabel}方向に約${Math.round(f.distanceMeters)}m`
          )
          .join("\n")
      : "(周辺の地図データは見つかりませんでした)";

  const prompt = `あなたは放送・映像取材のロケハンに詳しいベテランカメラマンです。
以下の現場について、実際に映像取材で使える撮影ポジションを2〜4個提案してください。

【現場名】${name}
【住所】${address}

【周辺の地図データ(OpenStreetMapより)】
${featuresText}

【参考: Wikipediaの説明】
${wikiSummary || "(該当する記事は見つかりませんでした)"}

各提案には、具体的にどこから(建物の入口前、駅前ロータリー、歩道橋の上など)、どの方向を向いて撮るか、なぜそこが良いのか(建物全体が入る、逆光を避けられる、看板が見えるなど)を書いてください。
現場を実際に見ていないことを踏まえ、地図データや一般的な知識から推測できる範囲で、確信度に応じたトーンで書いてください(断定しすぎない)。

以下のJSON形式のみで出力してください。前置きや説明文は一切不要です。
[
  {"position": "撮影する場所の説明", "direction": "向く方角や向き", "reason": "その位置を勧める理由"}
]`;

  try {
    // ヘルパー関数でAPI呼び出し（フォールバック処理付き）
    const result = await callAnthropicWithHaikuFallback({
      apiKey,
      prompt,
      maxTokens: 800,
      endpoint: "/api/suggest-shooting",
    });

    if (!result.success) {
      console.error("API Suggestion Failed:", {
        error: result.error,
        endpoint: "/api/suggest-shooting",
      });
      return NextResponse.json(
        { error: result.error, errorType: "api_failure" },
        { status: 500 }
      );
    }

    const text = result.data;

    // JSON パース前に応答をログ出力
    console.log("API Response (raw):", {
      length: text.length,
      preview: text.substring(0, 100),
      endpoint: "/api/suggest-shooting",
    });

    const cleaned = text.replace(/```json|```/g, "").trim();

    // JSON パース失敗のハンドリング
    let suggestions: ShootingSuggestion[];
    try {
      suggestions = JSON.parse(cleaned) as ShootingSuggestion[];
    } catch (parseErr) {
      const errorMessage = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.error("JSON Parse Error:", {
        error: errorMessage,
        rawText: text.substring(0, 500),
        cleaned: cleaned.substring(0, 500),
        endpoint: "/api/suggest-shooting",
      });
      return NextResponse.json(
        {
          error: "撮影ポジション提案の形式が不正です。AIからの返却データが正しくありません。",
          errorType: "json_parse_error",
          details: errorMessage,
        },
        { status: 500 }
      );
    }

    // 配列であることと最低要件を確認
    if (!Array.isArray(suggestions)) {
      console.error("Invalid Response Format:", {
        expectedArray: true,
        received: typeof suggestions,
        endpoint: "/api/suggest-shooting",
      });
      return NextResponse.json(
        {
          error: "撮影ポジション提案が配列形式ではありません。",
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
          "aiProposal.content.shootingPositions": suggestions,
          "aiProposal.generatedAt": Timestamp.now(),
        });
      } catch (saveErr) {
        console.error("AI Generation Error - Failed to save cache:", {
          error: saveErr instanceof Error ? saveErr.message : String(saveErr),
          pinId,
          endpoint: "/api/suggest-shooting",
        });
        // キャッシュ保存失敗は提案返却の邪魔はしない
      }
    }

    console.log("Successfully generated suggestions:", {
      count: suggestions.length,
      endpoint: "/api/suggest-shooting",
    });

    return NextResponse.json({ suggestions });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;

    console.error("AI Generation Error - Exception:", {
      error: errorMessage,
      errorStack,
      endpoint: "/api/suggest-shooting",
    });

    // タイムアウトとその他のエラーを区別
    const isTimeout = errorMessage.includes("timeout") || errorMessage.includes("DEADLINE_EXCEEDED");
    const userMessage = isTimeout
      ? "リクエストがタイムアウトしました。ネットワーク接続を確認してからお試しください。"
      : "撮影ポジション提案の生成に失敗しました。サーバーログを確認してください。";

    return NextResponse.json(
      { error: userMessage, details: errorMessage, errorType: "exception" },
      { status: 500 }
    );
  }
}
