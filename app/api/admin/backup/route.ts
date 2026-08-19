import { NextRequest, NextResponse } from "next/server";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Firebase Admin SDKを初期化
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

export async function GET(request: NextRequest) {
  // 認証チェックはクライアント側で実装されているため、ここではスキップ
  try {
    const backup = {
      timestamp: new Date().toISOString(),
      collections: {} as Record<string, any[]>,
    };

    // コレクション一覧を取得
    const collections = await db.listCollections();

    for (const collectionRef of collections) {
      const docsSnapshot = await collectionRef.get();
      const docs: any[] = [];

      docsSnapshot.forEach((doc) => {
        docs.push({
          id: doc.id,
          ...serializeData(doc.data()),
        });
      });

      backup.collections[collectionRef.id] = docs;
    }

    // JSONファイルとしてダウンロード
    const json = JSON.stringify(backup, null, 2);
    return new NextResponse(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="firestore-backup-${new Date().getTime()}.json"`,
      },
    });
  } catch (error) {
    console.error("Backup failed:", error);
    return NextResponse.json({ error: "バックアップに失敗しました" }, { status: 500 });
  }
}

function serializeData(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  // Firestoreのタイムスタンプを処理
  if (
    data &&
    typeof data === "object" &&
    "_seconds" in data &&
    "_nanoseconds" in data
  ) {
    const seconds = data._seconds || 0;
    const nanoseconds = data._nanoseconds || 0;
    return new Date(seconds * 1000 + nanoseconds / 1000000).toISOString();
  }

  if (Array.isArray(data)) {
    return data.map((item) => serializeData(item));
  }

  if (typeof data === "object") {
    const serialized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      serialized[key] = serializeData(value);
    }
    return serialized;
  }

  return data;
}
