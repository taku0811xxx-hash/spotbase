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

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

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
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
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
        endpoint: "/api/suggest-locations",
      });

      const errorMessage =
        res.status === 401 ? "APIキーが無効です" :
        res.status === 429 ? "リクエスト制限に達しました。しばらく待ってからお試しください" :
        res.status >= 500 ? "Anthropic API サーバーエラーが発生しました。しばらく待ってからお試しください" :
        "放送位置のスコアリングに失敗しました。しばらく時間を置いてお試しください。";

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
    const suggestion = JSON.parse(cleaned) as BroadcastLocationSuggestion;

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
      { error: userMessage, details: errorMessage },
      { status: 500 }
    );
  }
}
