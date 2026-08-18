"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getDispatchRecord, type DispatchRecord } from "@/lib/dispatchRecords";
import PageHeader from "@/components/PageHeader";
import PhotoLayoutEditor, {
  createInitialPositions,
  type PhotoPosition,
} from "@/components/PhotoLayoutEditor";

// セクション別の情報とアイコン定義
const SECTION_CONFIG = {
  siteInfo: { label: "現場情報", icon: "📍", color: "blue" },
  parkingInfo: { label: "駐車場所", icon: "🅿️", color: "green" },
  shootingSpots: { label: "撮影ポイント", icon: "📷", color: "purple" },
  ipTransmissionInfo: { label: "携帯回線(IP伝送)", icon: "📡", color: "cyan" },
  fpuInfo: { label: "FPU伝送", icon: "📶", color: "indigo" },
  hazards: { label: "危険箇所・注意事項", icon: "⚠️", color: "red" },
} as const;

type SectionKey = keyof typeof SECTION_CONFIG;

export default function DispatchReportPage() {
  const params = useParams<{ id: string }>();
  const [record, setRecord] = useState<DispatchRecord | null | undefined>(undefined);
  const [photoPositions, setPhotoPositions] = useState<PhotoPosition[]>([]);

  useEffect(() => {
    getDispatchRecord(params.id).then((r) => {
      setRecord(r);
      if (r?.photos?.length) {
        setPhotoPositions(createInitialPositions(r.photos));
      }
    });
  }, [params.id]);

  if (record === undefined) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="読み込み中..." backHref={`/dispatch/${params.id}`} backLabel="詳細に戻る" />
        <p className="p-4 text-sm text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (record === null) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="見つかりません" backHref="/dispatch" backLabel="一覧に戻る" />
        <p className="p-4 text-sm text-gray-500">この出動記録は見つかりませんでした。</p>
      </div>
    );
  }

  const createdAt = record.createdAt?.toDate?.();
  const reportTitle = `【報告書】${record.incidentType || record.locationName || "出動記録"}`;

  // セクションが存在するかチェック
  const hasSectionInfo = (key: SectionKey) => {
    const content = record[key as keyof DispatchRecord];
    const photos = record[`${key.replace("Info", "Photos")}` as keyof DispatchRecord];
    return !!content || (Array.isArray(photos) && photos.length > 0);
  };

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          .print-page { page-break-after: always; page-break-inside: avoid; }
          .print-card { break-inside: avoid; }
          .page-break-before { page-break-before: always; }
        }
      `}</style>

      <div className="print:hidden">
        <PageHeader
          title="出動報告書プレビュー"
          backHref={`/dispatch/${record.id}`}
          backLabel="詳細に戻る"
          action={
            <button
              onClick={() => window.print()}
              className="bg-blue-600 text-white text-sm font-medium rounded-lg px-4 py-2 shadow-sm hover:bg-blue-700 hover:shadow-md transition-all duration-150"
            >
              📄 印刷 / PDFで保存
            </button>
          }
        />
      </div>

      {/* A4 見開きレイアウト対応 */}
      <div className="max-w-6xl mx-auto print:max-w-none print:m-0">
        <div className="bg-white rounded-lg border border-gray-200 m-5 print:m-0 print:border-0 print:rounded-none shadow-lg print:shadow-none">
          {/* ===== ページ 1: タイトルと基本情報 ===== */}
          <div className="p-8 print:p-12 space-y-6 print-page">
            {/* 動的タイトル */}
            <div className="text-center border-b-4 border-blue-500 pb-8">
              <h1 className="text-4xl font-bold text-gray-900 mb-2">{reportTitle}</h1>
              {createdAt && (
                <p className="text-sm text-gray-600">
                  📅 {createdAt.toLocaleDateString("ja-JP")} /
                  👤 {record.recordedBy || "不明"}
                </p>
              )}
            </div>

            {/* 基本情報カード */}
            <div className="grid grid-cols-2 gap-6 print-card">
              <div className="border-l-4 border-blue-500 pl-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">出動内容</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{record.incidentType || "-"}</p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">場所</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{record.locationName}</p>
              </div>
              {record.address && (
                <div className="col-span-2 border-l-4 border-purple-500 pl-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">住所</p>
                  <p className="text-base text-gray-700 mt-1">{record.address}</p>
                </div>
              )}
              {record.lat != null && record.lng != null && (
                <div className="col-span-2 border-l-4 border-indigo-500 pl-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">GPS座標</p>
                  <p className="text-sm text-gray-700 font-mono mt-1">
                    {record.lat.toFixed(6)}, {record.lng.toFixed(6)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ===== ページ 2+: セクション別情報（カード形式） ===== */}
          <div className="p-8 print:p-12 space-y-6 print-page page-break-before">
            {/* 現場情報セクション群 */}
            {(record.siteInfo || record.parkingInfo || record.shootingSpots ||
              record.ipTransmissionInfo || record.fpuInfo || record.hazards) && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-gray-900 border-b-2 border-gray-300 pb-3">
                  📋 現場情報
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 各セクションをカード形式で表示 */}
                  {(["siteInfo", "parkingInfo", "shootingSpots", "ipTransmissionInfo", "fpuInfo"] as const).map(
                    (key) =>
                      hasSectionInfo(key) && (
                        <SectionCard
                          key={key}
                          section={key}
                          label={SECTION_CONFIG[key].label}
                          icon={SECTION_CONFIG[key].icon}
                          content={record[key] as string | undefined}
                          photos={
                            record[`${key.replace("Info", "Photos")}` as keyof DispatchRecord] as
                              | Array<{ url: string; caption?: string }>
                              | undefined
                          }
                        />
                      )
                  )}
                </div>

                {/* 危険箇所は全幅で強調表示 */}
                {record.hazards && (
                  <div className="mt-6 print-card break-inside-avoid">
                    <div className="bg-gradient-to-r from-red-50 to-orange-50 border-4 border-red-300 rounded-lg p-6">
                      <div className="flex items-start gap-3">
                        <span className="text-3xl flex-shrink-0">⚠️</span>
                        <div className="flex-1">
                          <h3 className="text-xl font-bold text-red-700">危険箇所・注意事項</h3>
                          <p className="text-gray-800 whitespace-pre-wrap mt-2 text-base leading-relaxed">
                            {record.hazards}
                          </p>
                          {record.hazardPhotos && record.hazardPhotos.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                              {record.hazardPhotos.map((photo, i) => (
                                <div key={i} className="print-card">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={photo.url}
                                    alt={photo.caption || ""}
                                    className="w-full h-32 object-cover rounded border-2 border-red-200"
                                  />
                                  {photo.caption && (
                                    <p className="text-xs text-gray-600 mt-2 text-center">{photo.caption}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* チェックポイント記録セクション */}
            {record.checkpoints.length > 0 && (
              <div className="print-page print-card">
                <h2 className="text-2xl font-bold text-gray-900 border-b-2 border-gray-300 pb-3 mb-4">
                  ⏱️ チェックポイント記録
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-600 bg-gray-50 border-b-2 border-gray-300">
                        <th className="py-2 px-3 font-semibold">時刻</th>
                        <th className="py-2 px-3 font-semibold">内容</th>
                        <th className="py-2 px-3 font-semibold">GPS座標</th>
                      </tr>
                    </thead>
                    <tbody>
                      {record.checkpoints.map((cp, i) => (
                        <tr key={i} className="border-b border-gray-200 hover:bg-blue-50">
                          <td className="py-2 px-3 text-gray-700 font-mono">
                            {new Date(cp.time).toLocaleTimeString("ja-JP")}
                          </td>
                          <td className="py-2 px-3 text-gray-900 font-medium">{cp.comment}</td>
                          <td className="py-2 px-3 text-gray-600 text-xs font-mono">
                            {cp.lat.toFixed(6)}, {cp.lng.toFixed(6)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 記録メモセクション */}
            {record.notes && record.notes.length > 0 && (
              <div className="print-page print-card">
                <h2 className="text-2xl font-bold text-gray-900 border-b-2 border-gray-300 pb-3 mb-4">
                  📝 記録メモ
                </h2>
                <div className="space-y-4">
                  {record.notes.map((note, i) => (
                    <div
                      key={i}
                      className="border-l-4 border-blue-400 bg-blue-50 p-4 rounded-r print-card"
                    >
                      {note.title && (
                        <p className="text-sm font-bold text-gray-800">{note.title}</p>
                      )}
                      <p className="text-sm text-gray-700 whitespace-pre-wrap mt-1">{note.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 持ち出した機材セクション */}
            {record.equipmentHeaders && record.equipmentHeaders.length > 0 && (
              <div className="print-page print-card">
                <h2 className="text-2xl font-bold text-gray-900 border-b-2 border-gray-300 pb-3 mb-4">
                  🧰 持ち出した機材
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-600 bg-gray-50 border-b-2 border-gray-300">
                        {record.equipmentHeaders.map((h, i) => (
                          <th key={i} className="py-2 px-3 font-semibold">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {record.equipmentRows.map((row, ri) => (
                        <tr key={ri} className="border-b border-gray-200 hover:bg-green-50">
                          {record.equipmentHeaders.map((_, ci) => (
                            <td key={ci} className="py-2 px-3 text-gray-700">
                              {row[ci] ?? "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* リアルタイム軌跡情報 */}
            <div className="text-xs text-gray-500 italic pt-4 border-t border-gray-300">
              📍 リアルタイム軌跡: {record.track.length}件のポイントを記録
              <br />
              SpotBase アプリ内の詳細画面で確認できます。
            </div>
          </div>

          {/* 現場写真レイアウトエディタ */}
          {record.photos && record.photos.length > 0 && (
            <div className="print-page page-break-before">
              <div className="print:hidden mb-4">
                <h2 className="text-xl font-bold text-gray-900">📸 現場写真の配置</h2>
                <p className="text-xs text-gray-600 mt-2">
                  ドラッグで位置調整、右下の±ボタンでサイズ変更できます。
                  調整完了後に「印刷 / PDFで保存」を押してください。
                </p>
              </div>
              <div className="bg-gray-50 border-2 border-dashed border-gray-300 print:bg-white print:border-0 p-4 print:p-0 rounded print:rounded-none">
                <PhotoLayoutEditor positions={photoPositions} onChange={setPhotoPositions} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * セクション別情報カードコンポーネント
 * 文章 + 写真をカード形式で表示
 */
function SectionCard({
  section,
  label,
  icon,
  content,
  photos,
}: {
  section: SectionKey;
  label: string;
  icon: string;
  content?: string;
  photos?: Array<{ url: string; caption?: string }>;
}) {
  const hasPhotos = Array.isArray(photos) && photos.length > 0;

  const colorClasses: Record<string, string> = {
    blue: "bg-blue-50 border-blue-200",
    green: "bg-green-50 border-green-200",
    purple: "bg-purple-50 border-purple-200",
    cyan: "bg-cyan-50 border-cyan-200",
    indigo: "bg-indigo-50 border-indigo-200",
    red: "bg-red-50 border-red-200",
  };

  const config = SECTION_CONFIG[section];
  const bgColor = colorClasses[config.color] || colorClasses.blue;

  return (
    <div className={`border-2 rounded-lg p-5 print-card break-inside-avoid ${bgColor}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{icon}</span>
        <h3 className="text-lg font-bold text-gray-900">{label}</h3>
      </div>

      {/* 文章部分 */}
      {content && (
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed mb-3">
          {content}
        </p>
      )}

      {/* 写真ギャラリー */}
      {hasPhotos &&
        Array.isArray(photos) &&
        photos.length > 0 &&
        photos.every((p) => p && typeof p.url === "string") && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            {photos.map((photo, i) => (
              <div key={i} className="print-card break-inside-avoid">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.caption || ""}
                  className="w-full h-32 object-cover rounded border-2 border-gray-200"
                />
                {photo.caption && (
                  <p className="text-xs text-gray-600 mt-2 px-1 leading-snug">{photo.caption}</p>
                )}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
