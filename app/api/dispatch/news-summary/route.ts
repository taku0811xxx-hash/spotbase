import { NextRequest, NextResponse } from "next/server";

// 「関連ニュースURL」欄に入力された記事URLを取得し、本文からタイトル・概要を
// AI(Claude Haiku)で抽出・整理して返す。出動中画面から呼ばれる想定。

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

  const { url } = (await req.json()) as { url?: string };
  if (!url || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: "有効なURLを入力してください" }, { status: 400 });
  }

  // 記事本文を取得
  let pageText = "";
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SpotBaseBot/1.0)",
        "Accept-Language": "ja",
      },
      // ニュースサイトの応答が重い場合に備えたタイムアウト
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `記事の取得に失敗しました(HTTP ${res.status})` },
        { status: 502 }
      );
    }
    const html = await res.text();
    pageText = stripHtml(html).slice(0, 6000); // AIへの入力量を抑える
  } catch (error) {
    console.error("関連ニュース取得エラー:", { url, error });
    return NextResponse.json(
      { error: "記事の取得に失敗しました。URLを確認するか、時間をおいて再度お試しください" },
      { status: 502 }
    );
  }

  if (!pageText) {
    return NextResponse.json({ error: "記事の本文を読み取れませんでした" }, { status: 502 });
  }

  if (!apiKey) {
    console.error("AI Generation Error - Missing API Key:", {
      endpoint: "/api/dispatch/news-summary",
      missingKey: "ANTHROPIC_API_KEY",
    });
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が .env.local に設定されていません。管理者にご連絡ください。" },
      { status: 500 }
    );
  }

  const prompt = `以下はニュース記事のページから抽出したテキストです。この記事の要点を、
放送・報道クルー向けの現場記録アプリで使う「関連ニュース概要」として整理してください。

---
${pageText}
---

以下のJSON形式のみで出力してください。前置きや説明文は一切不要です。
{
  "title": "記事の見出し(30文字程度)",
  "summary": "記事の要点を3〜4行程度で簡潔にまとめた概要"
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
      console.error("AI Generation Error - API Response Failed:", {
        status: res.status,
        statusText: res.statusText,
        body: text.substring(0, 200),
        endpoint: "/api/dispatch/news-summary",
      });
      const errorMessage =
        res.status === 401 ? "APIキーが無効です" :
        res.status === 429 ? "リクエスト制限に達しました。しばらく待ってからお試しください" :
        "概要の生成に失敗しました。しばらく時間を置いてお試しください。";
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    const data = await res.json();
    const rawText: string = data.content?.[0]?.text || "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "概要の生成結果を解析できませんでした" }, { status: 500 });
    }
    const parsed = JSON.parse(jsonMatch[0]) as { title?: string; summary?: string };

    return NextResponse.json({
      title: parsed.title || "",
      summary: parsed.summary || "",
    });
  } catch (error) {
    console.error("AI Generation Error - Unexpected:", {
      endpoint: "/api/dispatch/news-summary",
      error,
    });
    return NextResponse.json(
      { error: "概要の生成中に予期しないエラーが発生しました" },
      { status: 500 }
    );
  }
}
