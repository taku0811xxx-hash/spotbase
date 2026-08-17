import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

// 管理者専用: 自分と同じ組織のユーザー一覧を取得する。
// (Firestoreのセキュリティルール上、usersコレクションはクライアントから直接
//  一覧取得できないようにしているため、Admin SDK経由で提供する)

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const idToken = authHeader?.replace(/^Bearer\s+/i, "");
  if (!idToken) {
    return NextResponse.json({ error: "認証情報がありません" }, { status: 401 });
  }

  let callerUid: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    callerUid = decoded.uid;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  }

  const callerSnap = await getAdminDb().collection("users").doc(callerUid).get();
  const callerProfile = callerSnap.data();
  if (!callerSnap.exists || !callerProfile || callerProfile.accessLevel !== "admin") {
    return NextResponse.json({ error: "管理者のみ実行できます" }, { status: 403 });
  }

  const snap = await getAdminDb()
    .collection("users")
    .where("organizationId", "==", callerProfile.organizationId)
    .get();

  const users = snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      name: data.name,
      email: data.email,
      category: data.category,
      accessLevel: data.accessLevel,
    };
  });

  return NextResponse.json({ users });
}
