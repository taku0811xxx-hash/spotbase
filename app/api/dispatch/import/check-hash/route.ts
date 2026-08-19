import { NextRequest, NextResponse } from "next/server";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

export async function POST(request: NextRequest) {
  try {
    const { hash } = await request.json();

    if (!hash) {
      return NextResponse.json(
        { error: "ハッシュ値が必要です" },
        { status: 400 }
      );
    }

    // Firestore で sourceFileHash フィールドを検索
    const q = db.collection("dispatch_records").where("sourceFileHash", "==", hash);
    const snapshot = await q.get();

    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return NextResponse.json({
        isDuplicate: true,
        existingId: doc.id,
      });
    }

    return NextResponse.json({
      isDuplicate: false,
    });
  } catch (error) {
    console.error("Hash check failed:", error);
    return NextResponse.json(
      { error: "ハッシュチェックに失敗しました" },
      { status: 500 }
    );
  }
}
