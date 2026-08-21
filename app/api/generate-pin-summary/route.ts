import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

// 同じ場所で行われた複数の出動記録をAIに読ませて、現場記録(駐車場所・撮影ポイント・
// 伝送状況・危険箇所)としてまとめた1つの要約を作る。1件のみの場合もそのまま整形する。

type SourceRecord = {
  date: string;
  incidentType: string;
  parkingInfo: string;
  shootingSpots: string;
  ipTransmissionInfo: string;
  fpuInfo: string;
  hazards: string;
  notes: { title: string; body: string }[];
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

  if (!apiKey) {
    console.error("AI Generation Error - Missing API Key:", {
      endpoint: "/api/generate-pin-summary",
      missingKey: "ANTHROPIC_API_KEY",
    });
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が .env.local に設定されていません。管理者にご連絡ください。" },
      { status: 500 }
    );
  }

  const { locationName, address, records, pinId } = (await req.json()) as {
    locationName: string;
    address: string;
    records: SourceRecord[];
    pinId?: string;
  };

  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json({ error: "出動記録がありません" }, { status: 400 });
  }

  const recordsText = records
    .map(
      (r, i) => `
【出動記録 ${i + 1}】(${r.date}${r.incidentType ? ` / ${r.incidentType}` : ""})
駐車場所: ${r.parkingInfo || "(記載なし)"}
撮影ポイント: ${r.shootingSpots || "(記載なし)"}
携帯回線(IP伝送): ${r.ipTransmissionInfo || "(記載なし)"}
FPU伝送: ${r.fpuInfo || "(記載なし)"}
危険箇所・注意事項: ${r.hazards || "(記載なし)"}
記録メモ: ${
        r.notes.length > 0
          ? r.notes.map((n) => `${n.title ? `[${n.title}] ` : ""}${n.body}`).join(" / ")
          : "(なし)"
      }`
    )
    .join("\n");

  const prompt = `あなたは放送・映像取材のロケハン情報を整理するベテランカメラマンです。
以下は「${locationName}」(${address})という同じ現場について、${records.length}回分の出動記録から集めた情報です。

${recordsText}

これらを統合して、この現場について今後この場所へ行く人に向けた「現場記録」としてまとめてください。
複数回の記録に共通する情報は1つにまとめ、矛盾する情報(例: 「以前は停められたが最近は工事中」など)があれば
時系列が新しい方を優先しつつ、両方の情報が有用なら併記してください。記載がない項目は空文字にしてください。

以下のJSON形式のみで出力してください。前置きや説明文は一切不要です。
{
  "parkingInfo": "駐車場所についてのまとめ",
  "shootingSpots": "撮影ポイントについてのまとめ",
  "ipTransmissionInfo": "携帯回線(IP伝送)の状況についてのまとめ",
  "fpuInfo": "FPU伝送の状況についてのまとめ",
  "hazards": "危険箇所・注意事項についてのまとめ"
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
        max_tokens: 1000,
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
        endpoint: "/api/generate-pin-summary",
      });

      const errorMessage =
        res.status === 401 ? "APIキーが無効です" :
        res.status === 429 ? "リクエスト制限に達しました。しばらく待ってからお試しください" :
        res.status >= 500 ? "Anthropic API サーバーエラーが発生しました。しばらく待ってからお試しください" :
        "現場記録の生成に失敗しました。しばらく時間を置いてお試しください。";

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
    const summary = JSON.parse(cleaned) as {
      parkingInfo: string;
      shootingSpots: string;
      ipTransmissionInfo: string;
      fpuInfo: string;
      hazards: string;
    };

    // Firestore にキャッシュを保存
    if (pinId) {
      try {
        const db = getAdminDb();
        await db.collection("pins").doc(pinId).update({
          "aiProposal.content.pinSummary": summary,
          "aiProposal.generatedAt": Timestamp.now(),
        });
      } catch (saveErr) {
        console.error("AI Generation Error - Failed to save cache:", {
          error: saveErr instanceof Error ? saveErr.message : String(saveErr),
          pinId,
          endpoint: "/api/generate-pin-summary",
        });
        // キャッシュ保存失敗は提案返却の邪魔はしない
      }
    }

    return NextResponse.json({ summary });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;

    console.error("AI Generation Error - Exception:", {
      error: errorMessage,
      errorStack,
      endpoint: "/api/generate-pin-summary",
    });

    // タイムアウトとその他のエラーを区別
    const isTimeout = errorMessage.includes("timeout") || errorMessage.includes("DEADLINE_EXCEEDED");
    const userMessage = isTimeout
      ? "リクエストがタイムアウトしました。ネットワーク接続を確認してからお試しください。"
      : "現場記録の生成に失敗しました。サーバーログを確認してください。";

    return NextResponse.json(
      { error: userMessage, details: errorMessage },
      { status: 500 }
    );
  }
}
