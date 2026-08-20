import { updateDoc, doc, getDocs, collection, query, where } from "firebase/firestore";
import { db } from "./firebase";
import type { Pin } from "./pins";

/**
 * 既存ピンデータから建物名・地名を抽出して parentLocation を設定
 * 例: "国立競技場 千駄木付近" -> parentLocation: "国立競技場", name: "千駄木付近"
 */
export function extractParentLocation(fullName: string): { parentLocation: string; name: string } {
  // よくある建物・エリア名パターン
  const patterns = [
    "国立競技場",
    "財務省",
    "首相官邸",
    "霞が関",
    "日本銀行",
    "国会議事堂",
    "千駄木",
    "赤坂",
    "六本木",
    "丸の内",
    "日本テレビ",
    "朝日新聞",
    "NHK",
    "共同通信",
    "時事通信",
    "ニッカン",
    "スポーツ報知",
    "読売新聞",
    "産経新聞",
    "毎日新聞",
    "東京新聞",
    "中日新聞",
    "日経新聞",
    "リーガロイヤルホテル",
    "パレスホテル",
    "帝国ホテル",
    "ハイアット",
    "コンラッド",
    "ペニンシュラ",
    "フォーシーズンズ",
    "マリオット",
    "シェラトン",
    "グランドプリンス",
    "プリンスホテル",
  ];

  for (const pattern of patterns) {
    if (fullName.includes(pattern)) {
      const name = fullName.replace(pattern, "").trim();
      return {
        parentLocation: pattern,
        name: name || pattern, // name が空の場合は pattern を使用
      };
    }
  }

  // パターンに合致しない場合は、最初の単語を parentLocation とする
  const parts = fullName.trim().split(/\s+/);
  if (parts.length > 1) {
    return {
      parentLocation: parts[0],
      name: parts.slice(1).join(" "),
    };
  }

  // 単語が1つだけの場合は "その他" をparentLocationに
  return {
    parentLocation: "その他",
    name: fullName,
  };
}

/**
 * Firestore 内の全ピンに対して parentLocation を付与（マイグレーション用）
 * 注意: 実運用環境では慎重に実行してください
 */
export async function migrateAllPinsWithParentLocation(
  organizationId: string
): Promise<{ updated: number; failed: number }> {
  let updated = 0;
  let failed = 0;

  try {
    const q = query(
      collection(db, "pins"),
      where("organizationId", "==", organizationId)
    );
    const snapshots = await getDocs(q);

    for (const docSnap of snapshots.docs) {
      const pinData = docSnap.data() as Pin;
      
      // 既に parentLocation が設定されている場合はスキップ
      if (pinData.parentLocation) {
        console.log(`✓ スキップ: ${pinData.name} (既に parentLocation が設定済み)`);
        continue;
      }

      const { parentLocation, name } = extractParentLocation(pinData.name);

      try {
        await updateDoc(doc(db, "pins", docSnap.id), {
          parentLocation,
          name,
        });
        updated++;
        console.log(`✓ 更新: ${pinData.name} -> parentLocation: "${parentLocation}", name: "${name}"`);
      } catch (error) {
        failed++;
        console.error(`✗ 失敗: ${pinData.name}`, error);
      }
    }
  } catch (error) {
    console.error("マイグレーション失敗:", error);
  }

  return { updated, failed };
}
