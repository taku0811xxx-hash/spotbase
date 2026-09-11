// 同組織の他クルーの実機位置情報(Firestore `user_locations` コレクション)を
// リアルタイム購読し、Map コンポーネントが期待する CrewMember[] へ変換するユーティリティ。
//
// これまでapp/page.tsxではlib/dummyCrew.tsのダミーデータをそのまま表示していたが、
// 本モジュールでは実際にGPS追跡(出動中)しているメンバーの位置をFirestoreから
// 取得して表示する。書き込み側はlib/userPathHistory.ts(syncPathToFirestore)。

import { collection, onSnapshot, query, where, Timestamp } from "firebase/firestore";
import { db, auth } from "./firebase";
import type { CrewMember, CrewStatus } from "./dummyCrew";

// user_locations/{uid} ドキュメントの形(書き込み側のsyncPathToFirestoreと対応)
type UserLocationDoc = {
  organizationId?: string;
  category?: string;
  name?: string;
  phone?: string;
  status?: CrewStatus;
  position?: { lat: number; lng: number };
  path?: { lat: number; lng: number; timestamp: number }[];
  updatedAt?: Timestamp;
};

const DEFAULT_STATUS: CrewStatus = "待機中";

// Firestore Timestampを「3分前」のような相対表示に変換する。
// updatedAtが無い(=一度もGPS追跡していない)ドキュメントは呼び出し側で
// そもそも表示対象から除外されるため、ここに来る時点で通常は値がある想定。
function formatRelativeUpdatedAt(ts: Timestamp | undefined): string {
  if (!ts) return "不明";
  const diffMs = Date.now() - ts.toDate().getTime();
  if (diffMs < 60_000) return "たった今";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}

// user_locationsの1ドキュメントをCrewMemberへ変換する。
// position(またはpathの最終点)が無い=一度も位置情報が同期されていないメンバーは
// 地図上に表示しようがないのでnullを返し、呼び出し側で除外する。
function toCrewMember(uid: string, data: UserLocationDoc, isSelf: boolean): CrewMember | null {
  const lastPathPoint = data.path && data.path.length > 0 ? data.path[data.path.length - 1] : null;
  const position = data.position ?? (lastPathPoint ? { lat: lastPathPoint.lat, lng: lastPathPoint.lng } : null);
  if (!position) return null;

  return {
    id: uid,
    name: data.name || "不明なメンバー",
    // CrewMember.roleには分類(記者・カメラマン等)を表示用に流用する
    role: data.category || "",
    status: data.status ?? DEFAULT_STATUS,
    // 車両情報はuser_locationsに保存元が無いため、ダミー値は入れず空欄にする
    vehicle: "",
    phone: data.phone || "",
    updatedAt: formatRelativeUpdatedAt(data.updatedAt),
    position: [position.lat, position.lng],
    locationHistory:
      data.path && data.path.length > 1
        ? { path: data.path.map((p) => [p.lat, p.lng] as [number, number]), stayPoints: [] }
        : undefined,
    isSelf,
  };
}

// 同組織(organizationId一致)のメンバー(自分自身を含む)の位置情報をリアルタイム
// 購読する。以前は自分自身(selfUid)のドキュメントを一覧から除外していたが、
// それだとローカル側でGPS追跡をONにしていない別デバイス/別タブから地図を
// 開いた場合に自分のピンが一切表示されないという問題があった。そのため
// ここではselfUidも除外せず、isSelf:trueを付けて返す。表示側(Map.tsx)で
// isSelfを見て見た目(アイコン・ラベル)を他クルーと区別する。
// 返り値の関数を呼ぶと購読解除できる。
export function subscribeCrewLocations(
  organizationId: string,
  selfUid: string,
  onChange: (members: CrewMember[]) => void
): () => void {
  // 管理者画面にピンが出ない原因切り分け用のデバッグログ。
  // organizationId/selfUidが想定通りか(空文字・undefinedになっていないか)、
  // 取得件数、各ドキュメントの除外理由をここで確認できる。
  console.log("[クルー位置][Debug] 購読開始", { organizationId, selfUid });

  // Firestoreのfirestore.rulesはrequest.auth(サインイン状態)を前提にしている
  // (未サインインでのuser_locations読み取りは"Missing or insufficient
  // permissions"で拒否される)。auth.currentUserが無い状態でonSnapshotを
  // 張ってしまうと、無意味なpermission-deniedエラーが繰り返し発生するだけなので、
  // ここで明示的にガードし、呼び出し元にわかるようログを出して処理を中断する。
  if (!auth.currentUser) {
    console.error(
      "[クルー位置] 未ログイン状態(auth.currentUserがnull)のため、user_locationsの購読を中止しました。" +
        "セッションが切れている可能性があります。再度ログインしてください。",
      { organizationId, selfUid }
    );
    onChange([]);
    return () => {};
  }

  const q = query(collection(db, "user_locations"), where("organizationId", "==", organizationId));
  return onSnapshot(
    q,
    (snap) => {
      console.log("[クルー位置][Debug] onSnapshot受信: ドキュメント件数 =", snap.docs.length);

      const members: CrewMember[] = [];
      for (const d of snap.docs) {
        const uid = d.id;
        const data = d.data() as UserLocationDoc;

        const isSelf = uid === selfUid;

        const hasPosition = !!data.position;
        const hasPath = !!(data.path && data.path.length > 0);
        if (!hasPosition && !hasPath) {
          console.log(
            `[クルー位置][Debug] スキップ(position/pathなし): uid=${uid}, name=${data.name ?? "?"}, organizationId=${data.organizationId ?? "?"}, isSelf=${isSelf}`
          );
          continue;
        }

        const member = toCrewMember(uid, data, isSelf);
        if (!member) {
          // toCrewMember内部の判定と上のhasPosition/hasPathチェックが食い違うことは
          // 基本的に無いはずだが、念のためログを残す
          console.log(`[クルー位置][Debug] スキップ(変換失敗): uid=${uid}`);
          continue;
        }

        console.log("[クルー位置][Debug] CrewMemberへ変換成功:", member);
        members.push(member);
      }

      console.log(`[クルー位置][Debug] 最終的な表示対象クルー数 = ${members.length}`);
      onChange(members);
    },
    (error) => {
      // 権限エラー等が起きても地図自体は表示させ続けたいため、空配列にフォールバックする
      const firestoreError = error as { code?: string; message?: string };
      if (firestoreError?.code === "permission-denied") {
        // 購読開始時はauth.currentUserがあっても、その後トークン失効等で
        // "Missing or insufficient permissions"になるケースがあるため、
        // ここでも再ログインを促すログを出す(実際の再ログイン導線はUI側)。
        console.error(
          "[クルー位置] 権限エラー(permission-denied)によりuser_locationsを購読できません。" +
            "セッションが切れている可能性があります。再度ログインしてください。",
          { authCurrentUser: auth.currentUser?.uid ?? null, error }
        );
      } else {
        console.warn("[クルー位置] user_locationsの購読に失敗しました:", error);
      }
      onChange([]);
    }
  );
}
