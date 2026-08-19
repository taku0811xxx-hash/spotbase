import { NextRequest, NextResponse } from "next/server";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();

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
    const {
      extractedData,
      fileHash,
      organizationId,
      category,
      recordedBy,
    }: {
      extractedData: ExtractedData;
      fileHash: string;
      organizationId: string;
      category: string;
      recordedBy: string;
    } = await request.json();

    // バリデーション
    if (!extractedData.locationName) {
      return NextResponse.json(
        { error: "場所名は必須です" },
        { status: 400 }
      );
    }

    // 日付をパース
    const parsedDate = new Date(extractedData.date);

    // 出動記録を作成
    const docRef = db.collection("dispatch_records").doc();

    const recordData = {
      locationName: extractedData.locationName,
      address: extractedData.address,
      lat: null, // ジオコーディングは後で実装可能
      lng: null,
      incidentType: extractedData.incidentType,
      parkingInfo: extractedData.parkingInfo,
      shootingSpots: extractedData.shootingSpots,
      ipTransmissionInfo: extractedData.ipTransmissionInfo,
      fpuInfo: extractedData.fpuInfo,
      hazards: extractedData.hazards,
      checkpoints: [],
      track: [],
      equipmentHeaders: [],
      equipmentRows: [],
      notes: extractedData.notes
        ? [{ title: "インポート時の注記", body: extractedData.notes }]
        : [],
      photos: [],
      organizationId,
      category,
      recordedBy,
      status: "draft", // ドラフトとして保存
      draftSavedAt: Timestamp.now(),
      publishedAt: null,
      history: [
        {
          editedBy: recordedBy,
          editedAt: Timestamp.now(),
          changedFields: ["全フィールド"],
        },
      ],
      createdAt: Timestamp.fromDate(parsedDate),
      sourceFileHash: fileHash, // ハッシュを保存
    };

    await docRef.set(recordData);

    return NextResponse.json({
      recordId: docRef.id,
      success: true,
    });
  } catch (error) {
    console.error("Save failed:", error);
    return NextResponse.json(
      { error: "保存に失敗しました" },
      { status: 500 }
    );
  }
}
