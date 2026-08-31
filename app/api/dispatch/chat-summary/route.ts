import { NextRequest, NextResponse } from "next/server";

// 出動中(リアルタイム)画面の現場チャット履歴を、AI(Claude Haiku)で
// 「現場クルーの動き(行動状況)」と「出された指示内容」に整理して返す。
// APIキー未設定・外部API呼び出し失敗時は画面をエラーで止めず、
// チャット履歴から機械的に抽出した疑似要約(フォールバック)を返す。

type IncomingMessage = {
  sender?: string;
  text?: string;
  timestamp?: string;
};

type ChatSummaryResult = {
  overview: string;
  crewActions: string[];
  instructions: string[];
  pendingItems: string[];
};

// 「デスク」を含む送信者名、またはURLを含む発言は「指示・共有事項」側に、
// それ以外は「現場の動き」側に分類する簡易ルールベースの疑似要約。
// AI要約が使えない場合でも、画面が空にならず最低限の状況把握ができるようにする。
function buildFallbackSummary(messages: IncomingMessage[]): ChatSummaryResult {
  const bySender = new Map<string, string[]>();
  for (const m of messages) {
    const sender = (m.sender || "不明").trim();
    const text = (m.text || "").trim();
    if (!text) continue;
    const list = bySender.get(sender) || [];
    list.push(text);
    bySender.set(sender, list);
  }

  const crewActions: string[] = [];
  const instructions: string[] = [];
  const urlPattern = /https?:\/\/\S+/;

  for (const [sender, texts] of bySender) {
    const isDesk = sender.includes("デスク");
    const hasUrl = texts.some((t) => urlPattern.test(t));
    const bodyText = texts
      .map((t) => t.replace(urlPattern, "").trim())
      .filter(Boolean)
      .join("。");

    if (isDesk || hasUrl) {
      if (bodyText) {
        instructions.push(`${sender}：${bodyText}`);
      }
      if (hasUrl) {
        instructions.push(`${sender}より関連ニュースURLの共有あり`);
      }
    } else if (bodyText) {
      crewActions.push(`${sender}：${bodyText}`);
    }
  }

  return {
    overview:
      "AIによる要約が利用できなかったため、チャット履歴から自動抽出した簡易まとめを表示しています。",
    crewActions,
    instructions,
    pendingItems: [],
  };
}

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
    console.error("[Summary API Error]", {
      endpoint: "/api/dispatch/chat-summary",
      reason: "ANTHROPIC_API_KEY が未設定です。フォールバック要約を返します。",
    });
    return NextResponse.json({ ...buildFallbackSummary(messages), fallback: true });
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
      console.error("[Summary API Error]", {
        endpoint: "/api/dispatch/chat-summary",
        status: res.status,
        statusText: res.statusText,
        body: text.substring(0, 200),
      });
      // 外部APIエラー時も画面を止めず、フォールバック要約を返す
      return NextResponse.json({ ...buildFallbackSummary(messages), fallback: true });
    }

    const data = await res.json();
    const rawText: string = data.content?.[0]?.text || "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[Summary API Error]", {
        endpoint: "/api/dispatch/chat-summary",
        reason: "AI応答からJSONを抽出できませんでした",
        rawText: rawText.slice(0, 300),
      });
      return NextResponse.json({ ...buildFallbackSummary(messages), fallback: true });
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
    console.error("[Summary API Error]", {
      endpoint: "/api/dispatch/chat-summary",
      error,
    });
    // 予期しない例外(ネットワークエラー等)でも画面を止めず、フォールバック要約を返す
    return NextResponse.json({ ...buildFallbackSummary(messages), fallback: true });
  }
}
