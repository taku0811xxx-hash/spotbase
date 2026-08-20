import { Timestamp } from "firebase/firestore";
import type { Incident } from "@/lib/incidents";

/**
 * テスト用のダミー速報データを生成
 * （Firestore ルール未設定時のテスト用）
 */
export function generateTestIncidents(organizationId: string): Incident[] {
  const now = Timestamp.now();
  const baseDate = new Date(now.toDate());

  return [
    {
      id: "test-incident-1",
      organizationId,
      title: "渋谷スクランブル交差点の多車線事故",
      description: "タクシーとトラックが衝突。複数負傷者あり。通行止め実施中。",
      category: "事故",
      locationName: "渋谷スクランブル交差点",
      latitude: 35.6595,
      longitude: 139.7004,
      urgency: "high",
      status: "unverified",
      detectedAt: Timestamp.fromDate(new Date(baseDate.getTime() - 600000)), // 10分前
      createdAt: now,
      updatedAt: now,
      sourceText:
        "渋谷スクランブル交差点付近でタクシーとトラックが衝突。複数の負傷者が確認されており、警察が対応中です。",
    },
    {
      id: "test-incident-2",
      organizationId,
      title: "品川駅周辺での大規模停電",
      description: "駅周辺で停電発生。原因は配電盤のトラブルと推定。復旧中。",
      category: "通信障害",
      locationName: "品川駅南口周辺",
      latitude: 34.6299,
      longitude: 139.7394,
      urgency: "high",
      status: "unverified",
      detectedAt: Timestamp.fromDate(new Date(baseDate.getTime() - 1200000)), // 20分前
      createdAt: now,
      updatedAt: now,
      sourceText:
        "品川駅の南口周辺で大規模な停電が発生。駅周辺の店舗が営業できない状況が続いています。",
    },
    {
      id: "test-incident-3",
      organizationId,
      title: "横浜港付近での特殊火災",
      description: "倉庫で火災発生。鉄粉が積み重ねられた可能性あり。消防車が出動。",
      category: "火災",
      locationName: "横浜港みなとみらい地区",
      latitude: 35.4437,
      longitude: 139.6380,
      urgency: "high",
      status: "unverified",
      detectedAt: Timestamp.fromDate(new Date(baseDate.getTime() - 300000)), // 5分前
      createdAt: now,
      updatedAt: now,
      sourceText:
        "横浜港のみなとみらい地区の倉庫で火災が発生。消防車が複数台出動し、現在消火活動が行われています。",
    },
    {
      id: "test-incident-4",
      organizationId,
      title: "東京駅丸の内口での警察対応",
      description: "不審な荷物の報告あり。警察が爆発物処理班を派遣。",
      category: "その他",
      locationName: "東京駅丸の内口",
      latitude: 35.6814,
      longitude: 139.7671,
      urgency: "high",
      status: "unverified",
      detectedAt: Timestamp.fromDate(new Date(baseDate.getTime() - 1800000)), // 30分前
      createdAt: now,
      updatedAt: now,
      sourceText:
        "東京駅の丸の内口付近で不審な荷物が発見されました。警察が到着し、爆発物処理班が対応予定です。",
    },
    {
      id: "test-incident-5",
      organizationId,
      title: "新宿駅東口での大規模混雑",
      description: "駅構内が異常混雑。駅員が対応中。原因は調査中。",
      category: "その他",
      locationName: "新宿駅東口",
      latitude: 35.6908,
      longitude: 139.7007,
      urgency: "medium",
      status: "unverified",
      detectedAt: Timestamp.fromDate(new Date(baseDate.getTime() - 900000)), // 15分前
      createdAt: now,
      updatedAt: now,
      sourceText:
        "新宿駅の東口付近で大規模な混雑が発生しています。駅員が整理に当たっています。",
    },
  ];
}
