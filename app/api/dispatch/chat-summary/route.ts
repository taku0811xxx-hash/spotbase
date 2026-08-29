import { NextRequest, NextResponse } from "next/server";

// 出動中(リアルタイム)画面の現場チャット履歴を、AI(Claude Haiku)で
// 「現場クルーの動き(行動状況)」と「出された指示内容」に整理して返す。

type IncomingMessage = {
  sender?: string;
  text?: string;
  timestamp?: string;
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

  const { messages, locationName, incidentType } = (await req.json()) as {
    messages?: IncomingMessage[];
    locationName?: string;
    incidentType?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "要約できるチャット履歴がありません" }, { status: 400 });
  }

  if (!apiKey) {
    console.error("AI Generation Error - Missing API Key:", {
      endpoint: "/api/dispatch/chat-summary",
      missingKey: "ANTHROPIC_API_KEY",
    });
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が .env.local に設定されていません。管理者にご連絡ください。" },
      { status: 500 }
    );
  }

  // AIへの入力量を抑えるため、直近200件・各発言500文字までに制限する
  const transcript = messages
    .slice(-200)
    .map((m) => {
      const time = m.timestamp
        ? new Date(m.timestamp).toLocaleString("ja-JP", { hour: "2-digit", minute: "2-digit" })
        : "";
      return `[${time}] ${m.sender || "不明"}: ${(m.text || "").slice(0, 500)}`;
    })
    .join("\n")
    .slice(0, 12000);

  const contextLines = [
    locationName ? `現場: ${locationName}` : "",
    incidentType ? `出動内容: ${incidentType}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `以下は、放送・報道クルーが出動中の現場でやり取りしたチャットの履歴です。
${contextLines}

---
${transcript}
---

この履歴から、後から現場の経緯を把握できるように整理してください。
推測で補わず、履歴に書かれている内容だけを根拠にしてください。

以下のJSON形式のみで出力してください。前置きや説明文は一切不要です。
{
  "overview": "全体の流れを2〜3行でまとめた概要",
  "crewActions": ["現場クルーの動き(行動状況)を時系列で簡潔に。該当がなければ空配列"],
  "instructions": ["出された指示内容を簡潔に。誰から誰へかが分かる場合は含める。該当がなければ空配列"],
  "pendingItems": ["未解決・未確認のまま残っている事項。なければ空配列"]
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
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("AI Generation Error - API Response Failed:", {
        status: res.status,
        statusText: res.statusText,
        body: text.substring(0, 200),
        endpoint: "/api/dispatch/chat-summary",
      });
      const errorMessage =
        res.status === 401 ? "APIキーが無効です" :
        res.status === 429 ? "リクエスト制限に達しました。しばらく待ってからお試しください" :
        "要約の生成に失敗しました。しばらく時間を置いてお試しください。";
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    const data = await res.json();
    const rawText: string = data.content?.[0]?.text || "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "要約の生成結果を解析できませんでした" }, { status: 500 });
    }
    const parsed = JSON.parse(jsonMatch[0]) as {
      overview?: string;
      crewActions?: string[];
      instructions?: string[];
      pendingItems?: string[];
    };

    const toStringArray = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && !!v.trim()) : [];

    return NextResponse.json({
      overview: parsed.overview || "",
      crewActions: toStringArray(parsed.crewActions),
      instructions: toStringArray(parsed.instructions),
      pendingItems: toStringArray(parsed.pendingItems),
    });
  } catch (error) {
    console.error("AI Generation Error - Unexpected:", {
      endpoint: "/api/dispatch/chat-summary",
      error,
    });
    return NextResponse.json(
      { error: "要約の生成中に予期しないエラーが発生しました" },
      { status: 500 }
    );
  }
}
