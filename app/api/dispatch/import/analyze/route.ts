import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ExtractedData {
  locationName: string;
  address: string;
  incidentType: string;
  date: string;
  parkingInfo: string;
  shootingSpots: string;
  ipTransmissionInfo: string;
  fpuInfo: string;
  hazards: string;
  notes: string;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const fileType = formData.get("fileType") as string;

    if (!file) {
      return NextResponse.json({ error: "ファイルが必要です" }, { status: 400 });
    }

    let textContent = "";

    // ファイルタイプに応じて処理
    if (fileType === "text/plain") {
      textContent = await file.text();
    } else if (fileType === "application/pdf") {
      // PDFの場合、ローカルで text-extraction ライブラリを使うことが理想的
      // ここでは Claude に PDF として直接送信
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");

      const response = await anthropic.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: base64,
                },
              },
              {
                type: "text",
                text: "このドキュメントのテキストをすべて抽出してください。形式は問いません。",
              },
            ],
          },
        ],
      });

      textContent =
        response.content[0].type === "text" ? response.content[0].text : "";
    } else if (fileType.startsWith("image/")) {
      // 画像の場合
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const mediaType = fileType as
        | "image/jpeg"
        | "image/png"
        | "image/gif"
        | "image/webp";

      const response = await anthropic.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64,
                },
              },
              {
                type: "text",
                text: "この画像から読み取れる全てのテキストを抽出してください。",
              },
            ],
          },
        ],
      });

      textContent =
        response.content[0].type === "text" ? response.content[0].text : "";
    }

    if (!textContent) {
      return NextResponse.json(
        { error: "ファイルからテキストを抽出できませんでした" },
        { status: 400 }
      );
    }

    // 抽出したテキストを Claude で構造化データに変換
    const structureResponse = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1024,
      system: `You are a report parser. Extract the following information from the given text and return ONLY valid JSON, no other text:
{
  "locationName": "place name (e.g., Shinjuku Station)",
  "address": "address",
  "incidentType": "type of incident (e.g., news coverage, accident coverage)",
  "date": "ISO datetime string (YYYY-MM-DDTHH:mm)",
  "parkingInfo": "parking information",
  "shootingSpots": "shooting spots/positions",
  "ipTransmissionInfo": "mobile/IP transmission status",
  "fpuInfo": "FPU transmission status",
  "hazards": "hazards and precautions",
  "notes": "additional notes and observations"
}
Return ONLY the JSON object, no explanation or markdown.`,
      messages: [
        {
          role: "user",
          content: `Extract information from this report:\n\n${textContent}`,
        },
      ],
    });

    let extracted: ExtractedData;
    try {
      const jsonStr =
        structureResponse.content[0].type === "text"
          ? structureResponse.content[0].text
          : "{}";
      extracted = JSON.parse(jsonStr);
    } catch (e) {
      console.error("JSON parse failed:", e);
      return NextResponse.json(
        { error: "抽出結果の解析に失敗しました" },
        { status: 500 }
      );
    }

    // デフォルト値を設定
    const result: ExtractedData = {
      locationName: extracted.locationName || "",
      address: extracted.address || "",
      incidentType: extracted.incidentType || "",
      date: extracted.date || new Date().toISOString().slice(0, 16),
      parkingInfo: extracted.parkingInfo || "",
      shootingSpots: extracted.shootingSpots || "",
      ipTransmissionInfo: extracted.ipTransmissionInfo || "",
      fpuInfo: extracted.fpuInfo || "",
      hazards: extracted.hazards || "",
      notes: extracted.notes || "",
    };

    return NextResponse.json({ extracted: result });
  } catch (error) {
    console.error("AI Generation Error - Exception:", {
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      endpoint: "/api/dispatch/import/analyze",
    });
    return NextResponse.json(
      { error: "ファイル解析に失敗しました（タイムアウトまたはAPIエラー）" },
      { status: 500 }
    );
  }
}
