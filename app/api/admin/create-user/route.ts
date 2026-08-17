import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

// 管理者専用: 自分と同じ組織に、新しいメンバー(またはその組織の管理者)を発行する。
// ブラウザから直接Firebase Authの新規作成を呼ぶと、作成した瞬間に呼び出し側が
// 新アカウントにログイン切り替えされてしまう(Firebase Client SDKの仕様)ため、
// Admin SDKを使ってサーバー側で作成する。

export async function POST(req: NextRequest) {
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

  const body = await req.json();
  const { name, email, password, category, accessLevel } = body as {
    name?: string;
    email?: string;
    password?: string;
    category?: string;
    accessLevel?: "admin" | "member";
  };

  if (!name || !email || !password || !category) {
    return NextResponse.json({ error: "入力が不足しています" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "パスワードは6文字以上にしてください" },
      { status: 400 }
    );
  }

  try {
    const newUser = await getAdminAuth().createUser({
      email,
      password,
      displayName: name,
    });

    await getAdminDb().collection("users").doc(newUser.uid).set({
      name,
      email,
      organizationId: callerProfile.organizationId,
      organizationName: callerProfile.organizationName,
      category,
      accessLevel: accessLevel === "admin" ? "admin" : "member",
      createdAt: new Date(),
    });

    return NextResponse.json({ uid: newUser.uid });
  } catch (err: unknown) {
    console.error(err);
    const code = (err as { code?: string })?.code ?? "";
    if (code === "auth/email-already-exists") {
      return NextResponse.json(
        { error: "このメールアドレスは既に使われています" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "ユーザーの作成に失敗しました" }, { status: 500 });
  }
}
