import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { callAnthropicWithHaikuFallback } from "@/lib/anthropicModel";
import { buildLatestInfoPrompt, type PromptActivityLog, type PromptReport } from "@/lib/latestInfoPrompt";
import { ACTIVITY_ACTION_LABELS, type ActivityActionType, type LatestInfoSummary } from "@/lib/spotRecords";

// 場所(pin)の過去報告書と対応履歴をAI(Haiku)に読ませて「最新情報」を集約する。
// 現在の対象はpinのみ。

const ENDPOINT = "/api/spot-latest-summary";
const MAX_LOGS = 30;
const MAX_REPORTS = 10;

function iso(ts: Timestamp | undefined): string {
  return ts?.toDate?.().toISOString() ?? "";
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY が設定されていません" }, { status: 500 });
  }

  const idToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!idToken) {
    return NextResponse.json({ error: "認証情報がありません" }, { status: 401 });
  }
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  }

  const { pinId } = (await req.json()) as { pinId?: string };
  if (!pinId) {
    return NextResponse.json({ error: "pinIdが必要です" }, { status: 400 });
  }

  const db = getAdminDb();
  const [profileSnap, pinSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("pins").doc(pinId).get(),
  ]);
  const profile = profileSnap.data();
  const pin = pinSnap.data();
  if (!profile || !pin) {
    return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
  }
  // Firestoreルール(canView)と同じ条件: 同組織、かつ管理者または同分類
  const allowed =
    profile.organizationId === pin.organizationId &&
    (profile.accessLevel === "admin" || profile.category === pin.category);
  if (!allowed) {
    return NextResponse.json({ error: "閲覧権限がありません" }, { status: 403 });
  }

  const [logSnap, reportSnap] = await Promise.all([
    db
      .collection("activity_logs")
      .where("organizationId", "==", pin.organizationId)
      .where("targetId", "==", pinId)
      .orderBy("loggedAt", "desc")
      .limit(MAX_LOGS)
      .get(),
    db
      .collection("spot_reports")
      .where("organizationId", "==", pin.organizationId)
      .where("targetId", "==", pinId)
      .orderBy("createdAt", "desc")
      .limit(MAX_REPORTS)
      .get(),
  ]);

  if (logSnap.empty && reportSnap.empty) {
    return NextResponse.json({ error: "報告書も対応履歴も登録されていません" }, { status: 400 });
  }

  const logs: (PromptActivityLog & { id: string })[] = logSnap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      at: iso(x.loggedAt) || iso(x.createdAt),
      actorName: x.actorName ?? "",
      actionLabel: ACTIVITY_ACTION_LABELS[x.actionType as ActivityActionType] ?? x.actionType ?? "",
      status: x.status ?? "",
      detail: x.detail ?? "",
      interviewNotes: x.interviewNotes ?? "",
    };
  });
  const reports: PromptReport[] = reportSnap.docs.map((d) => {
    const x = d.data();
    return {
      createdAt: iso(x.createdAt),
      title: x.title ?? "",
      body: x.body ?? "",
      interviewNotes: x.interviewNotes ?? "",
    };
  });

  const targetName = [pin.parentLocation, pin.name].filter(Boolean).join(" ");
  const prompt = buildLatestInfoPrompt({ targetName, reports, logs });
  const result = await callAnthropicWithHaikuFallback({
    apiKey,
    prompt,
    maxTokens: 1500,
    endpoint: ENDPOINT,
  });
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  let parsed: Partial<LatestInfoSummary>;
  try {
    parsed = JSON.parse(result.data.replace(/```json|```/g, "").trim());
  } catch {
    console.error(`[AI Generation Error] endpoint=${ENDPOINT} reason=JSON parse failed`);
    return NextResponse.json({ error: "AIの応答を解析できませんでした。再度お試しください。" }, { status: 502 });
  }

  const newestLog = [...logs].sort((a, b) => b.at.localeCompare(a.at))[0];
  const summary: LatestInfoSummary = {
    currentStatus: String(parsed.currentStatus ?? ""),
    changeSummary: String(parsed.changeSummary ?? ""),
    fieldNotes: String(parsed.fieldNotes ?? ""),
    openItems: Array.isArray(parsed.openItems) ? parsed.openItems.map(String) : [],
    basedOnLogId: newestLog?.id ?? null,
    generatedAt: new Date().toISOString(),
  };

  try {
    await db.collection("pins").doc(pinId).update({
      "aiProposal.content.latestSummary": summary,
    });
  } catch (err) {
    // キャッシュ保存の失敗は要約の返却を妨げない
    console.error(`[AI Generation Error] endpoint=${ENDPOINT} cache save failed`, err);
  }

  return NextResponse.json({ summary });
}
