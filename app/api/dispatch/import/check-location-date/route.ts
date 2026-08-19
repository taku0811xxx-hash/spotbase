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
    const { locationName, date, organizationId } = await request.json();

    if (!locationName || !date) {
      return NextResponse.json(
        { error: "locationName と date が必要です" },
        { status: 400 }
      );
    }

    // 日付をパース
    const parsedDate = new Date(date);
    const dayStart = new Date(parsedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(parsedDate);
    dayEnd.setHours(23, 59, 59, 999);

    // Firestore で同じ場所・日付の記録を検索
    let q = db
      .collection("dispatch_records")
      .where("locationName", "==", locationName)
      .where("createdAt", ">=", dayStart)
      .where("createdAt", "<=", dayEnd);

    if (organizationId) {
      q = q.where("organizationId", "==", organizationId);
    }

    const snapshot = await q.get();

    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      const docData = doc.data();
      return NextResponse.json({
        isDuplicate: true,
        recordId: doc.id,
        locationName: docData.locationName,
        date: docData.createdAt?.toDate?.()?.toISOString() || date,
      });
    }

    return NextResponse.json({
      isDuplicate: false,
    });
  } catch (error) {
    console.error("Location-date check failed:", error);
    return NextResponse.json(
      { error: "チェックに失敗しました" },
      { status: 500 }
    );
  }
}
