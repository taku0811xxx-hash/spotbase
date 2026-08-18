"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getDispatchRecord, type DispatchRecord } from "@/lib/dispatchRecords";
import PageHeader from "@/components/PageHeader";
import PhotoLayoutEditor, {
  createInitialPositions,
  type PhotoPosition,
} from "@/components/PhotoLayoutEditor";

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

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="print:hidden">
        <PageHeader
          title="報告書プレビュー"
          backHref={`/dispatch/${record.id}`}
          backLabel="詳細に戻る"
          action={
            <button
              onClick={() => window.print()}
              className="bg-blue-600 text-white text-sm font-medium rounded-lg px-4 py-2 shadow-sm hover:bg-blue-700 hover:shadow-md transition-all duration-150"
            >
              印刷 / PDFで保存
            </button>
          }
        />
      </div>

      <div className="max-w-3xl mx-auto p-5 sm:p-10 print:p-0 print:max-w-none">
        <div className="bg-white rounded-xl border border-gray-200 p-8 sm:p-12 print:border-0 print:rounded-none print:shadow-none space-y-8">
          <div className="text-center border-b border-gray-200 pb-6">
            <h1 className="text-2xl font-bold text-gray-900">出動報告書</h1>
            {createdAt && (
              <p className="text-sm text-gray-500 mt-1">
                作成日: {createdAt.toLocaleDateString("ja-JP")}
              </p>
            )}
          </div>

          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 pr-4 text-gray-500 font-medium w-32 align-top">出動者</th>
                <td className="py-2 text-gray-900">{record.recordedBy || "不明"}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 pr-4 text-gray-500 font-medium align-top">場所</th>
                <td className="py-2 text-gray-900">
                  {record.locationName}
                  {record.lat != null && record.lng != null && (
                    <span className="text-gray-400 text-xs ml-2">
                      ({record.lat.toFixed(5)}, {record.lng.toFixed(5)})
                    </span>
                  )}
                </td>
              </tr>
              {record.address && (
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium align-top">住所</th>
                  <td className="py-2 text-gray-900">{record.address}</td>
                </tr>
              )}
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 pr-4 text-gray-500 font-medium align-top">出動内容</th>
                <td className="py-2 text-gray-900">{record.incidentType || "-"}</td>
              </tr>
            </tbody>
          </table>

          {(record.parkingInfo || record.shootingSpots || record.ipTransmissionInfo || record.fpuInfo || record.hazards) && (
            <div>
              <h2 className="font-semibold text-gray-900 mb-2 text-sm border-b border-gray-200 pb-1">
                現場情報
              </h2>
              <table className="w-full text-sm">
                <tbody>
                  {record.parkingInfo && (
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-4 text-gray-500 font-medium w-32 align-top">駐車場所</th>
                      <td className="py-2 text-gray-900 whitespace-pre-wrap">{record.parkingInfo}</td>
                    </tr>
                  )}
                  {record.shootingSpots && (
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-4 text-gray-500 font-medium align-top">撮影ポイント</th>
                      <td className="py-2 text-gray-900 whitespace-pre-wrap">{record.shootingSpots}</td>
                    </tr>
                  )}
                  {record.ipTransmissionInfo && (
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-4 text-gray-500 font-medium align-top">
                        携帯回線(IP伝送)
                      </th>
                      <td className="py-2 text-gray-900 whitespace-pre-wrap">{record.ipTransmissionInfo}</td>
                    </tr>
                  )}
                  {record.fpuInfo && (
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-4 text-gray-500 font-medium align-top">FPU伝送</th>
                      <td className="py-2 text-gray-900 whitespace-pre-wrap">{record.fpuInfo}</td>
                    </tr>
                  )}
                  {record.hazards && (
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-4 text-gray-500 font-medium align-top">
                        危険箇所・注意事項
                      </th>
                      <td className="py-2 text-gray-900 whitespace-pre-wrap">{record.hazards}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <h2 className="font-semibold text-gray-900 mb-2 text-sm border-b border-gray-200 pb-1">
              チェックポイント記録
            </h2>
            {record.checkpoints.length === 0 ? (
              <p className="text-sm text-gray-400">記録なし</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="py-1.5 font-medium">時刻</th>
                    <th className="py-1.5 font-medium">内容</th>
                    <th className="py-1.5 font-medium">位置</th>
                  </tr>
                </thead>
                <tbody>
                  {record.checkpoints.map((cp, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-1.5 text-gray-700">
                        {new Date(cp.time).toLocaleTimeString("ja-JP")}
                      </td>
                      <td className="py-1.5 text-gray-900 font-medium">{cp.comment}</td>
                      <td className="py-1.5 text-gray-500">
                        {cp.lat.toFixed(5)}, {cp.lng.toFixed(5)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2 text-sm border-b border-gray-200 pb-1">
              記録メモ
            </h2>
            {record.notes?.length > 0 ? (
              <div className="space-y-2">
                {record.notes.map((note, i) => (
                  <div key={i}>
                    {note.title && (
                      <p className="text-sm font-medium text-gray-800">{note.title}</p>
                    )}
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.body}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">記載なし</p>
            )}
          </div>

          {record.equipmentHeaders?.length > 0 && (
            <div>
              <h2 className="font-semibold text-gray-900 mb-2 text-sm border-b border-gray-200 pb-1">
                持ち出した機材
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    {record.equipmentHeaders.map((h, i) => (
                      <th key={i} className="py-1.5 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {record.equipmentRows.map((row, ri) => (
                    <tr key={ri} className="border-b border-gray-50">
                      {record.equipmentHeaders.map((_, ci) => (
                        <td key={ci} className="py-1.5 text-gray-700">{row[ci] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="text-sm text-gray-400 pt-4 border-t border-gray-100">
            リアルタイム軌跡: {record.track.length}件のポイントを記録
            (SpotBase内の詳細画面で確認できます)
          </div>
        </div>

        {record.photos?.length > 0 && (
          <div className="mt-6 print:mt-0 print:break-before-page">
            <div className="print:hidden mb-3">
              <h2 className="font-semibold text-gray-900">現場写真の配置</h2>
              <p className="text-xs text-gray-500 mt-1">
                写真をドラッグして位置を調整できます。右下の±ボタンでサイズも変更できます。
                調整が終わったら「印刷 / PDFで保存」を押してください。
              </p>
            </div>
            <div className="bg-white border border-gray-200 print:border-0 p-4 print:p-0">
              <PhotoLayoutEditor positions={photoPositions} onChange={setPhotoPositions} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
