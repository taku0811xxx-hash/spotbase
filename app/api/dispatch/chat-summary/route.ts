import { NextRequest, NextResponse } from "next/server";

// 出動中(リアルタイム)画面の現場チャット履歴を、Anthropic API(Claude)で
// 「現場の状況とクルーの動き」「主な指示と対応」「現在のステータス」の3項目に
// 要約する。ANTHROPIC_API_KEYが未設定、または外部API呼び出しに失敗した場合は
// 疑似要約でごまかさず、その旨を明確なエラーとして返す。

const MODEL = "claude-3-5-haiku-20241022";

type IncomingMessage = {
  sender?: string;
  text?: string;
  timestamp?: string;
};

type ChatSummaryResult = {
  crewStatus: string;
  instructions: string;
  currentPhase: string;
};

// Claudeの応答テキスト(■見出し区切りのプレーンテキスト)を3セクションへ分割する
function parseSummaryText(rawText: string): ChatSummaryResult {
  const extract = (label: string, nextLabels: string[]): string => {
    const startIdx = rawText.indexOf(label);
    if (startIdx === -1) return "";
    let endIdx = rawText.length;
    for (const next of nextLabels) {
      const idx = rawText.indexOf(next, startIdx + label.length);
      if (idx !== -1 && idx < endIdx) endIdx = idx;
    }
    return rawText.slice(startIdx + label.length, endIdx).trim();
  };

  const LABEL_STATUS = "■ 現場の状況とクルーの動き";
  const LABEL_INSTRUCTIONS = "■ 主な指示と対応";
  const LABEL_PHASE = "■ 現在のステータス";

  return {
    crewStatus: extract(LABEL_STATUS, [LABEL_INSTRUCTIONS, LABEL_PHASE]),
    instructions: extract(LABEL_INSTRUCTIONS, [LABEL_PHASE, LABEL_STATUS]),
    currentPhase: extract(LABEL_PHASE, [LABEL_STATUS, LABEL_INSTRUCTIONS]),
  };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const { messages, locationName, incidentType } = (await req.json()) as {
    messages?: IncomingMessage[];
    locationName?: string;
    incidentType?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "要約できるチャット履歴がありません" }, { status: 400 });
  }

  if (!apiKey) {
    console.error("[Summary API Error]", {
      endpoint: "/api/dispatch/chat-summary",
      reason: "ANTHROPIC_API_KEY が未設定です",
    });
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が設定されていません" },
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

  const prompt = `あなたは報道・現場対応チームをサポートするAIアシスタントです。
提供された現場チャットログを解析し、以下のフォーマットで簡潔かつ正確に要約を作成してください。

■ 現場の状況とクルーの動き
（誰がどこで何をしているか、回線・機材・現場の最新状況）

■ 主な指示と対応
（デスクや管理者からの指示内容と、それに対する現場の対応状況）

■ 現在のステータス
（「局発・移動中」「現場到着・準備中」「中継・対応中」「撤収・帰局中」などの現在のフェーズ）

${contextLines ? `【現場情報】\n${contextLines}\n\n` : ""}【チャット履歴】
${transcript}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[Summary API Error]", {
        endpoint: "/api/dispatch/chat-summary",
        status: res.status,
        statusText: res.statusText,
        body: text.substring(0, 200),
      });
      const errorMessage =
        res.status === 401
          ? "APIキーが無効です"
          : res.status === 429
            ? "リクエスト制限に達しました。しばらく待ってからお試しください"
            : "要約の生成に失敗しました。しばらく時間を置いてお試しください。";
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    const data = await res.json();
    const rawText: string = data.content?.[0]?.text || "";
    if (!rawText.trim()) {
      console.error("[Summary API Error]", {
        endpoint: "/api/dispatch/chat-summary",
        reason: "AIの応答が空でした",
      });
      return NextResponse.json({ error: "要約の生成結果を取得できませんでした" }, { status: 500 });
    }

    const summary = parseSummaryText(rawText);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[Summary API Error]", {
      endpoint: "/api/dispatch/chat-summary",
      error,
    });
    return NextResponse.json(
      { error: "要約の生成中に予期しないエラーが発生しました" },
      { status: 500 }
    );
  }
}
