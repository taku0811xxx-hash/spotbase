import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

export type ShootingSuggestion = {
  position: string; // どこから撮るか
  direction: string; // 方角・向き
  reason: string; // 理由
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

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
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      let anthropicError = "不明なエラー";

      // Anthropic API のエラーレスポンスをパース試行
      try {
        const errorData = JSON.parse(text);
        if (errorData.error?.message) {
          anthropicError = errorData.error.message;
        } else if (errorData.message) {
          anthropicError = errorData.message;
        }
      } catch {
        anthropicError = text.substring(0, 200); // 最初の200文字までを使用
      }

      console.error("AI Generation Error - API Response Failed:", {
        status: res.status,
        statusText: res.statusText,
        anthropicError,
        endpoint: "/api/suggest-shooting",
      });

      const errorMessage =
        res.status === 401 ? "APIキーが無効です" :
        res.status === 429 ? "リクエスト制限に達しました。しばらく待ってからお試しください" :
        res.status >= 500 ? "Anthropic API サーバーエラーが発生しました。しばらく待ってからお試しください" :
        "撮影ポジション提案の生成に失敗しました。しばらく時間を置いてお試しください。";

      return NextResponse.json(
        { error: errorMessage, details: anthropicError },
        { status: 500 }
      );
    }

    const data = await res.json();
    const text = data.content
      ?.map((block: { type: string; text?: string }) =>
        block.type === "text" ? block.text : ""
      )
      .join("") ?? "";

    const cleaned = text.replace(/```json|```/g, "").trim();
    const suggestions = JSON.parse(cleaned) as ShootingSuggestion[];

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
      { error: userMessage, details: errorMessage },
      { status: 500 }
    );
  }
}
