import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { callAnthropicWithHaikuFallback } from "@/lib/anthropicModel";
import { buildLatestInfoPrompt, type PromptFieldRecord } from "@/lib/latestInfoPrompt";
import { ACTIVITY_ACTION_LABELS, type ActivityActionType, type LatestInfoSummary } from "@/lib/spotRecords";

// 場所(pin)の過去報告書と対応履歴をAI(Haiku)に読ませて「最新情報」を集約する。
// 現在の対象はpinのみ。

const ENDPOINT = "/api/spot-latest-summary";
const MAX_RECORDS = 10; // 直近の現場記録数
const MAX_LOGS_PER_RECORD = 10;
const MAX_REPORTS_PER_RECORD = 5;
const LEGACY_KEY = "__legacy__"; // fieldRecordId未設定の旧データ

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

  const [recordSnap, logSnap, reportSnap] = await Promise.all([
    db
      .collection("field_records")
      .where("organizationId", "==", pin.organizationId)
      .where("pinId", "==", pinId)
      .orderBy("recordDate", "desc")
      .limit(MAX_RECORDS)
      .get(),
    db
      .collection("activity_logs")
      .where("organizationId", "==", pin.organizationId)
      .where("targetId", "==", pinId)
      .orderBy("loggedAt", "desc")
      .limit(MAX_RECORDS * MAX_LOGS_PER_RECORD)
      .get(),
    db
      .collection("spot_reports")
      .where("organizationId", "==", pin.organizationId)
      .where("targetId", "==", pinId)
      .orderBy("createdAt", "desc")
      .limit(MAX_RECORDS * MAX_REPORTS_PER_RECORD)
      .get(),
  ]);

  if (recordSnap.empty && logSnap.empty && reportSnap.empty) {
    return NextResponse.json({ error: "現場記録がまだ登録されていません" }, { status: 400 });
  }

  const buckets = new Map<string, PromptFieldRecord>();
  for (const d of recordSnap.docs) {
    const x = d.data();
    buckets.set(d.id, {
      recordDate: iso(x.recordDate),
      title: x.title ?? "",
      interviewNotes: x.interviewNotes ?? "",
      logs: [],
      reports: [],
    });
  }
  const legacy: PromptFieldRecord = {
    recordDate: "",
    title: "記録に未分類(旧データ)",
    interviewNotes: "",
    logs: [],
    reports: [],
  };
  const bucketFor = (fieldRecordId: string | undefined) =>
    fieldRecordId ? buckets.get(fieldRecordId) : legacy; // 直近N件外の記録の項目はundefined(除外)

  let newestLogId: string | null = null;
  let newestLogAt = "";
  for (const d of logSnap.docs) {
    const x = d.data();
    const at = iso(x.loggedAt) || iso(x.createdAt);
    const bucket = bucketFor(x.fieldRecordId);
    if (!bucket || bucket.logs.length >= MAX_LOGS_PER_RECORD) continue;
    bucket.logs.push({
      at,
      actorName: x.actorName ?? "",
      actionLabel: ACTIVITY_ACTION_LABELS[x.actionType as ActivityActionType] ?? x.actionType ?? "",
      status: x.status ?? "",
      detail: x.detail ?? "",
      interviewNotes: x.interviewNotes ?? "",
    });
    if (at > newestLogAt) {
      newestLogAt = at;
      newestLogId = d.id;
    }
  }
  for (const d of reportSnap.docs) {
    const x = d.data();
    const bucket = bucketFor(x.fieldRecordId);
    if (!bucket || bucket.reports.length >= MAX_REPORTS_PER_RECORD) continue;
    bucket.reports.push({
      createdAt: iso(x.createdAt),
      title: x.title ?? "",
      body: x.body ?? "",
      interviewNotes: x.interviewNotes ?? "",
    });
  }
  if (legacy.logs.length > 0 || legacy.reports.length > 0) {
    // 旧データ枠の日付は、含まれる項目の最新日時で代用する
    legacy.recordDate = [...legacy.logs.map((l) => l.at), ...legacy.reports.map((r) => r.createdAt)]
      .sort()
      .reverse()[0];
    buckets.set(LEGACY_KEY, legacy);
  }
  const records = [...buckets.values()];

  const targetName = [pin.parentLocation, pin.name].filter(Boolean).join(" ");
  const prompt = buildLatestInfoPrompt({ targetName, records });
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

  const summary: LatestInfoSummary = {
    currentStatus: String(parsed.currentStatus ?? ""),
    changeSummary: String(parsed.changeSummary ?? ""),
    fieldNotes: String(parsed.fieldNotes ?? ""),
    openItems: Array.isArray(parsed.openItems) ? parsed.openItems.map(String) : [],
    basedOnLogId: newestLogId,
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
