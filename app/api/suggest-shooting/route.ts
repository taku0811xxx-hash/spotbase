import { NextRequest, NextResponse } from "next/server";

export type ShootingSuggestion = {
  position: string; // どこから撮るか
  direction: string; // 方角・向き
  reason: string; // 理由
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEYが設定されていません" },
      { status: 500 }
    );
  }

  const { name, address, osmFeatures, wikiSummary } = await req.json();

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
        model: "claude-3-5-haiku-20241022",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("AI Generation Error - API Response Failed:", {
        status: res.status,
        statusText: res.statusText,
        error: text,
        endpoint: "/api/suggest-shooting",
      });
      return NextResponse.json(
        { error: "撮影ポジション提案の生成に失敗しました。しばらく時間を置いてお試しください。" },
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

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("AI Generation Error - Exception:", {
      error: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined,
      endpoint: "/api/suggest-shooting",
    });
    return NextResponse.json(
      { error: "撮影ポジション提案の生成に失敗しました（タイムアウトまたはAPIエラー）" },
      { status: 500 }
    );
  }
}
