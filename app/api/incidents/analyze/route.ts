import { Anthropic } from "@anthropic-ai/sdk";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import type { IncidentCategory, IncidentUrgency } from "@/lib/incidents";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface AnalysisResult {
  title: string;
  description: string;
  category: IncidentCategory;
  locationName: string;
  latitude: number;
  longitude: number;
  urgency: IncidentUrgency;
}

export async function POST(request: Request) {
  try {
    const { text, organizationId } = await request.json();

    if (!text || !organizationId) {
      return Response.json(
        { error: "text と organizationId は必須です" },
        { status: 400 }
      );
    }

    // Claude Haiku を使用して速報テキストを解析
    const systemPrompt = `
あなたは速報テキストを分析する専門家です。
受け取った速報テキストから以下の情報を日本語で JSON 形式で抽出してください：
- title: 事象の短い説明（15文字以内）
- description: 詳細説明（50文字以内）
- category: 事象の種別（火災/事故/災害/通信障害/その他 のいずれか）
- locationName: 推定場所（例：渋谷スクランブル交差点）
- latitude: 推定緯度（東京中心地域: 35.0-36.0）
- longitude: 推定経度（東京中心地域: 139.0-140.0）
- urgency: 緊急度（high/medium/low）

JSON のみを出力してください。必ず有効な JSON 形式で返してください。
`;

    const message = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `速報テキスト: ${text}`,
        },
      ],
    });

    // Claude の応答を JSON として解析
    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    // JSON を抽出（```json...``` ブロックがあれば除去）
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json(
        { error: "解析結果が JSON 形式ではありません" },
        { status: 400 }
      );
    }

    const analysis = JSON.parse(jsonMatch[0]) as AnalysisResult;

    // Firestore に登録
    const now = Timestamp.now();
    const adminDb = getAdminDb();
    const incidentsRef = adminDb.collection("incidents");
    const docRef = await incidentsRef.add({
      organizationId,
      title: analysis.title,
      description: analysis.description,
      category: analysis.category,
      locationName: analysis.locationName,
      latitude: analysis.latitude,
      longitude: analysis.longitude,
      urgency: analysis.urgency,
      status: "unverified",
      detectedAt: now,
      createdAt: now,
      updatedAt: now,
      sourceText: text,
    });

    return Response.json({
      id: docRef.id,
      ...analysis,
      status: "unverified",
      detectedAt: now.toDate().toISOString(),
    });
  } catch (error) {
    console.error("AI Generation Error - Exception:", {
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      endpoint: "/api/incidents/analyze",
    });
    return Response.json(
      { error: "速報解析に失敗しました（タイムアウトまたはAPIエラー）" },
      { status: 500 }
    );
  }
}
