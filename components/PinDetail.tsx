"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deletePin, type Pin, type PinDrawing, type PinExif } from "@/lib/pins";
import { APP_MODE } from "@/lib/config";
import ConfirmDialog from "./ConfirmDialog";
import Toast, { type ToastState } from "./Toast";

function PhotoGrid({ urls, alt }: { urls: string[]; alt: string }) {
  if (urls.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {urls.map((url) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          src={url}
          alt={alt}
          className="rounded border border-gray-200 object-cover w-full h-32"
        />
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  photoUrls,
  alt,
}: {
  label: string;
  value?: string;
  photoUrls?: string[];
  alt: string;
}) {
  if (!value && (!photoUrls || photoUrls.length === 0)) return null;
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      {value && <p className="whitespace-pre-wrap">{value}</p>}
      {photoUrls && <PhotoGrid urls={photoUrls} alt={alt} />}
    </div>
  );
}

// 撮影機材・撮影条件(EXIF)の表示枠。photoモード専用。
// 現時点では自動抽出機能はなく、値が入っていれば表示し、なければ空状態を出す
// (将来、画像アップロード時のEXIF自動読み取りに対応する想定のプレースホルダー)。
function ExifSection({ exif }: { exif?: PinExif }) {
  const hasAny =
    !!exif &&
    (exif.camera || exif.lens || exif.fNumber !== undefined || exif.iso !== undefined || exif.exposureTime || exif.shotAt);

  return (
    <div className="border-t border-gray-100 pt-4">
      <p className="text-xs text-gray-500 mb-2">撮影情報(EXIF)</p>
      {hasAny && exif ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-gray-700">
          {exif.camera && (
            <>
              <dt className="text-gray-400">カメラ</dt>
              <dd>{exif.camera}</dd>
            </>
          )}
          {exif.lens && (
            <>
              <dt className="text-gray-400">レンズ</dt>
              <dd>{exif.lens}</dd>
            </>
          )}
          {exif.fNumber !== undefined && (
            <>
              <dt className="text-gray-400">F値</dt>
              <dd>F{exif.fNumber}</dd>
            </>
          )}
          {exif.iso !== undefined && (
            <>
              <dt className="text-gray-400">ISO</dt>
              <dd>{exif.iso}</dd>
            </>
          )}
          {exif.exposureTime && (
            <>
              <dt className="text-gray-400">シャッター速度</dt>
              <dd>{exif.exposureTime}</dd>
            </>
          )}
          {exif.shotAt && (
            <>
              <dt className="text-gray-400">撮影日時</dt>
              <dd>{exif.shotAt.toDate().toLocaleString("ja-JP")}</dd>
            </>
          )}
        </dl>
      ) : (
        <p className="text-sm text-gray-400">
          カメラ・レンズ・F値・ISO・撮影時間帯などのEXIF情報は未登録です
        </p>
      )}
    </div>
  );
}

// 「基本情報・注意事項」タブの中身。旧仕様の固定フィールド(parkingInfo等)は
// PinForm.tsx(現在の入力画面)が実際に使い続けている項目のため、
// 中身が空でない限りそのまま表示を継続する(空項目はFieldコンポーネント側で
// 自動的に非表示になるため、レイアウト崩れは発生しない)。
//
// photoモード時は、放送・報道クルー向け項目(駐車場所/伝送状況等)を出さず、
// 写真を大きく見せた上で「説明」(hazards)「撮影アドバイス」(shootingSpots)と
// EXIF情報欄のみを表示する、フォトスポット共有アプリ向けのレイアウトにする。
function BasicInfoTab({ pin, isPhotoMode }: { pin: Pin; isPhotoMode: boolean }) {
  if (isPhotoMode) {
    return (
      <div className="space-y-5">
        {pin.photoUrls.length > 0 ? (
          <div className="space-y-3">
            {pin.photoUrls.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt={pin.name}
                className="w-full rounded-xl border border-gray-200 object-cover max-h-[32rem]"
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">まだ写真が登録されていません</p>
        )}

        {pin.hazards && (
          <div>
            <p className="text-xs text-gray-500 mb-1">説明</p>
            <p className="whitespace-pre-wrap">{pin.hazards}</p>
          </div>
        )}

        {pin.shootingSpots && (
          <div>
            <p className="text-xs text-gray-500 mb-1">撮影アドバイス</p>
            <p className="whitespace-pre-wrap">{pin.shootingSpots}</p>
          </div>
        )}

        <ExifSection exif={pin.exif} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Field label="駐車場所" value={pin.parkingInfo} alt={pin.name} />
      <Field
        label="撮影ポイント"
        value={pin.shootingSpots}
        photoUrls={pin.shootingPhotoUrls}
        alt={`${pin.name} 撮影ポイント`}
      />
      <Field label="携帯回線(IP伝送)の状況" value={pin.ipTransmissionInfo} alt={pin.name} />
      <Field label="FPU伝送の状況" value={pin.fpuInfo} alt={pin.name} />
      {pin.signalInfo && (
        <Field label="電波状況(旧項目)" value={pin.signalInfo} alt={pin.name} />
      )}
      <Field
        label="危険箇所・注意事項"
        value={pin.hazards}
        photoUrls={pin.hazardPhotoUrls}
        alt={`${pin.name} 危険箇所`}
      />

      {pin.photoUrls.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">現場全体の写真</p>
          <PhotoGrid urls={pin.photoUrls} alt={pin.name} />
        </div>
      )}

      {!pin.parkingInfo &&
        !pin.shootingSpots &&
        !pin.ipTransmissionInfo &&
        !pin.fpuInfo &&
        !pin.hazards &&
        pin.photoUrls.length === 0 && (
          <p className="text-sm text-gray-400">まだ基本情報が登録されていません</p>
        )}
    </div>
  );
}

// 「図面管理」タブの中身。「最新図面(最新版)」を大きく表示し、それ以外は
// 「過去の図面履歴」としてアップロード日時・アップロード者付きで一覧表示する。
function DrawingsTab({ drawings }: { drawings?: PinDrawing[] }) {
  if (!drawings || drawings.length === 0) {
    return <p className="text-sm text-gray-400">図面はまだ登録されていません</p>;
  }

  const sorted = [...drawings].sort(
    (a, b) => b.uploadedAt.toMillis() - a.uploadedAt.toMillis()
  );
  const latest = sorted.find((d) => d.isLatest) ?? sorted[0];
  const history = sorted.filter((d) => d.id !== latest.id);
  const isPdf = latest.fileName.toLowerCase().endsWith(".pdf");

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-600">最新図面(最新版)</p>
        {isPdf ? (
          <a
            href={latest.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 text-sm bg-blue-50 border border-blue-100 rounded-lg px-3 py-3 hover:bg-blue-100 transition-colors"
          >
            <span className="truncate">📄 {latest.fileName}</span>
            <span className="text-[11px] text-blue-600 flex-shrink-0">開く / ダウンロード</span>
          </a>
        ) : (
          <a href={latest.url} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={latest.url}
              alt={latest.fileName}
              className="rounded-lg border border-gray-200 w-full max-h-96 object-contain bg-gray-50"
            />
          </a>
        )}
        <p className="text-[11px] text-gray-400">
          {latest.uploadedAt.toDate().toLocaleString("ja-JP")} / {latest.uploadedBy}
        </p>
      </div>

      {history.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1.5">過去の図面履歴</p>
          <ul className="space-y-1.5">
            {history.map((d) => (
              <li key={d.id}>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-100 transition-colors"
                >
                  <span className="truncate">{d.fileName}</span>
                  <span className="text-gray-400 flex-shrink-0">
                    {d.uploadedAt.toDate().toLocaleDateString("ja-JP")} / {d.uploadedBy}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// 固定タブ(基本情報・図面管理)のid。customFieldsから動的に増えるタブは
// `field:${項目名}` という文字列で表す(SiteRecordForm.tsxの動的タブと同じ方式)。
type FixedTab = "basic" | "drawings";
const DYNAMIC_FIELD_PREFIX = "field:";

const FIXED_TABS: { id: FixedTab; label: string }[] = [
  { id: "basic", label: "基本情報・注意事項" },
  { id: "drawings", label: "図面管理" },
];

type Props = {
  pin: Pin;
  // 地図画面のピン選択パネルなど、埋め込み表示として使う場合に指定する。
  // 未指定時(=/pin/[pinId]の単独ページ)はルーター遷移で代用する。
  onClose?: () => void;
  onDeleted?: () => void;
};

export default function PinDetail({ pin, onClose, onDeleted }: Props) {
  const router = useRouter();
  const recordedAt = pin.recordedAt?.toDate?.();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [tab, setTab] = useState<string>("basic");

  const isPhotoMode = APP_MODE === "photo";
  const customFields = pin.customFields ?? [];
  // photoモードでは「図面管理」タブを出さない(フォトスポット共有アプリに図面管理は不要なため)
  const fixedTabs = isPhotoMode ? FIXED_TABS.filter((t) => t.id !== "drawings") : FIXED_TABS;

  async function handleDelete() {
    setDeleting(true);
    try {
      await deletePin(pin.id);
      if (onDeleted) {
        onDeleted();
      } else {
        router.push("/");
      }
    } catch (err) {
      console.error(err);
      setDeleting(false);
      setDeleteConfirmOpen(false);
      setToast({ type: "error", message: "削除に失敗しました" });
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="この現場情報を削除しますか?"
        summary={[{ label: "現場名", value: pin.name }]}
        confirmLabel="削除する"
        submitting={deleting}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className={`font-bold truncate ${isPhotoMode ? "text-2xl" : "text-xl"}`}>
              {pin.name}
            </h1>
            {/* photoモードでは管理IDバッジを出さず、タイトルと住所/アクセスメモを前面に出す */}
            {!isPhotoMode && pin.referenceId && (
              <span
                title="管理ID(参照番号)"
                className="text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-0.5 whitespace-nowrap"
              >
                ID: {pin.referenceId}
              </span>
            )}
          </div>
          <p className={isPhotoMode ? "text-base text-gray-700 mt-0.5" : "text-gray-600"}>
            {pin.address}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link
            href={`/pin/${pin.id}/edit`}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 hover:border-gray-400 hover:shadow-sm active:scale-[0.98] transition-all duration-150"
          >
            編集
          </Link>
          <button
            onClick={() => setDeleteConfirmOpen(true)}
            className="text-sm border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50 hover:border-red-300 hover:shadow-sm active:scale-[0.98] transition-all duration-150"
          >
            削除
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="text-sm text-gray-500 hover:text-gray-700 rounded-lg px-2 py-1.5 hover:bg-gray-100 transition-colors"
              aria-label="閉じる"
              title="閉じる"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="text-xs text-gray-500">
        {recordedAt && `最終更新: ${recordedAt.toLocaleDateString("ja-JP")}`}
      </div>

      {/* 左側ナビゲーション(タブ) + 右側コンテンツ。
          基本情報・図面管理は固定タブ、customFieldsの各項目は動的タブとして並べる
          (PinForm.tsx/SiteRecordForm.tsxの「＋ 項目を追加」で増えるタブと同じ考え方)。 */}
      <div className="flex gap-4 items-start">
        <div className="w-28 sm:w-44 flex-shrink-0 space-y-1">
          {fixedTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`w-full text-left text-[11px] sm:text-sm font-medium rounded-lg px-2.5 sm:px-3 py-2 transition-colors ${
                tab === t.id
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t.label}
            </button>
          ))}

          {customFields.length > 0 && (
            <div className="pt-1.5 mt-1.5 border-t border-gray-200 space-y-1">
              {customFields.map((f) => {
                const tabId = `${DYNAMIC_FIELD_PREFIX}${f.key}`;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setTab(tabId)}
                    title={f.key}
                    className={`w-full text-left text-[11px] sm:text-sm font-medium rounded-lg px-2.5 sm:px-3 py-2 truncate transition-colors ${
                      tab === tabId
                        ? "bg-blue-600 text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {f.key}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {tab === "basic" && <BasicInfoTab pin={pin} isPhotoMode={isPhotoMode} />}
          {tab === "drawings" && <DrawingsTab drawings={pin.drawings} />}
          {tab.startsWith(DYNAMIC_FIELD_PREFIX) &&
            (() => {
              const key = tab.slice(DYNAMIC_FIELD_PREFIX.length);
              const field = customFields.find((f) => f.key === key);
              if (!field) return null;
              return (
                <div>
                  <p className="text-xs text-gray-500 mb-1">{field.key}</p>
                  <p className="whitespace-pre-wrap break-words">{field.value}</p>
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}
