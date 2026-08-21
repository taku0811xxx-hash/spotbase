import { NextRequest, NextResponse } from "next/server";

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
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEYが設定されていません" },
      { status: 500 }
    );
  }

  const { candidates, incidentType, address } = await req.json();

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
        model: "claude-3-5-haiku-20241022",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("AI Generation Error - API Response Failed:", {
        status: res.status,
        statusText: res.statusText,
        error: text,
        endpoint: "/api/suggest-locations",
      });
      return NextResponse.json(
        { error: "放送位置のスコアリングに失敗しました。しばらく時間を置いてお試しください。" },
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

    return NextResponse.json({ suggestion });
  } catch (err) {
    console.error("AI Generation Error - Exception:", {
      error: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined,
      endpoint: "/api/suggest-locations",
    });
    return NextResponse.json(
      { error: "放送位置のスコアリングに失敗しました（タイムアウトまたはAPIエラー）" },
      { status: 500 }
    );
  }
}
