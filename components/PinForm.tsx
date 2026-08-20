"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createPin, updatePin, type Pin } from "@/lib/pins";
import { useAuth } from "@/components/AuthProvider";
import { geocodeQuery, reverseGeocode } from "@/lib/geocode";
import Toast, { type ToastState } from "./Toast";
import ConfirmDialog from "./ConfirmDialog";

// LeafletはSSR非対応なのでクライアント側のみで読み込む
const LocationPicker = dynamic(() => import("./LocationPicker"), {
  ssr: false,
});

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 space-y-6">
      <div>
        <h2 className="font-semibold text-gray-900 text-base">{title}</h2>
        {description && (
          <p className="text-xs text-gray-500 mt-1">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z"
      />
    </svg>
  );
}

const inputClass =
  "w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow";

const fileInputClass =
  "block w-full text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:text-xs file:font-medium hover:file:bg-blue-100";

function ExistingPhotos({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <div className="grid grid-cols-4 gap-1.5 mt-2">
      {urls.map((url) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          src={url}
          alt=""
          className="rounded border border-gray-200 object-cover w-full h-14"
        />
      ))}
    </div>
  );
}

function PhotoPicker({
  label,
  files,
  onChange,
  existingUrls,
}: {
  label: string;
  files: File[];
  onChange: (files: File[]) => void;
  existingUrls?: string[];
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      {existingUrls && existingUrls.length > 0 && (
        <>
          <p className="text-[11px] text-gray-400">登録済みの写真</p>
          <ExistingPhotos urls={existingUrls} />
        </>
      )}
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => onChange(Array.from(e.target.files ?? []))}
        className={`${fileInputClass} mt-2`}
      />
      {files.length > 0 && (
        <p className="text-xs text-gray-400 mt-1">{files.length}枚追加予定</p>
      )}
    </div>
  );
}

type Props = {
  initialPosition?: { lat: number; lng: number } | null;
  initialAddress?: string;
  initialName?: string;
  initialParkingInfo?: string;
  initialShootingSpots?: string;
  initialIpTransmissionInfo?: string;
  initialFpuInfo?: string;
  initialHazards?: string;
  existingPin?: Pin | null; // 指定があれば編集モード
};

export default function PinForm({
  initialPosition,
  initialAddress,
  initialName,
  initialParkingInfo,
  initialShootingSpots,
  initialIpTransmissionInfo,
  initialFpuInfo,
  initialHazards,
  existingPin,
}: Props) {
  const router = useRouter();
  const { profile } = useAuth();
  const isEdit = !!existingPin;

  const [parentLocation, setParentLocation] = useState(
    existingPin?.parentLocation ?? ""
  );
  const [name, setName] = useState(existingPin?.name ?? initialName ?? "");
  const [address, setAddress] = useState(
    existingPin?.address ?? initialAddress ?? ""
  );
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(
    existingPin
      ? { lat: existingPin.lat, lng: existingPin.lng }
      : initialPosition ?? null
  );
  const [parkingInfo, setParkingInfo] = useState(
    existingPin?.parkingInfo ?? initialParkingInfo ?? ""
  );
  const [shootingSpots, setShootingSpots] = useState(
    existingPin?.shootingSpots ?? initialShootingSpots ?? ""
  );
  const [ipTransmissionInfo, setIpTransmissionInfo] = useState(
    existingPin?.ipTransmissionInfo ?? initialIpTransmissionInfo ?? ""
  );
  const [fpuInfo, setFpuInfo] = useState(existingPin?.fpuInfo ?? initialFpuInfo ?? "");
  const [hazards, setHazards] = useState(existingPin?.hazards ?? initialHazards ?? "");

  const [photos, setPhotos] = useState<File[]>([]);
  const [shootingPhotos, setShootingPhotos] = useState<File[]>([]);
  const [hazardPhotos, setHazardPhotos] = useState<File[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [nameSearching, setNameSearching] = useState(false);
  const [parkingGpsLoading, setParkingGpsLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 位置がユーザー自身の操作(地図クリックなど)で決まった後は、
  // 現場名の入力による自動検索で上書きしないようにするためのフラグ
  const positionLockedRef = useRef(!!initialPosition || isEdit);

  // 地図をクリックした時に、その場所の住所を自動で取得して入力する
  async function handlePositionChange(pos: { lat: number; lng: number }) {
    positionLockedRef.current = true;
    setPosition(pos);
    setAddressLoading(true);
    try {
      const found = await reverseGeocode(pos.lat, pos.lng);
      if (found) setAddress(found);
    } catch (err) {
      console.error(err);
    } finally {
      setAddressLoading(false);
    }
  }

  // 現場名を入力すると、まだ位置が手動で決まっていない場合に限り、
  // その名前で場所を検索して自動でピンを立てる(入力が止まってから実行)
  useEffect(() => {
    if (positionLockedRef.current) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    const timer = setTimeout(async () => {
      setNameSearching(true);
      try {
        const results = await geocodeQuery(trimmed);
        if (positionLockedRef.current) return;
        if (results.length > 0) {
          const top = results[0];
          setPosition({ lat: top.lat, lng: top.lng });
          setAddress(top.displayName);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setNameSearching(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [name]);

  // 駐車場所欄: 現在地(GPS)の住所を取得して、駐車場所メモに挿入する
  function handleInsertCurrentLocationToParking() {
    if (!navigator.geolocation) {
      setToast({ type: "error", message: "この端末は位置情報の取得に対応していません" });
      return;
    }
    setParkingGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const found = await reverseGeocode(
            pos.coords.latitude,
            pos.coords.longitude
          );
          const text =
            found ??
            `緯度${pos.coords.latitude.toFixed(5)} / 経度${pos.coords.longitude.toFixed(5)}`;
          setParkingInfo((prev) =>
            prev ? `${prev}\n現在地: ${text}` : `現在地: ${text}`
          );
        } catch (err) {
          console.error(err);
          setToast({ type: "error", message: "住所の取得に失敗しました" });
        } finally {
          setParkingGpsLoading(false);
        }
      },
      (err) => {
        console.error(err);
        setParkingGpsLoading(false);
        setToast({
          type: "error",
          message: "現在地を取得できませんでした。位置情報の許可を確認してください",
        });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function handleOpenConfirm(e: React.FormEvent) {
    e.preventDefault();

    if (!position) {
      setToast({
        type: "error",
        message: "現場名を入力するか、地図をクリックして場所を選択してください",
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setConfirmOpen(true);
  }

  async function handleConfirmedSubmit() {
    if (!position) return;
    if (!profile) {
      setToast({ type: "error", message: "ログインしてください" });
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && existingPin) {
        await updatePin(existingPin.id, {
          parentLocation,
          name,
          address,
          lat: position.lat,
          lng: position.lng,
          parkingInfo,
          shootingSpots,
          ipTransmissionInfo,
          fpuInfo,
          hazards,
          organizationId: existingPin.organizationId,
          category: existingPin.category,
          recordedBy: profile.name,
          newPhotos: photos,
          newShootingPhotos: shootingPhotos,
          newHazardPhotos: hazardPhotos,
        });
        setConfirmOpen(false);
        setToast({ type: "success", message: "現場情報を更新しました" });
        setTimeout(() => router.push(`/pin/${existingPin.id}`), 600);
      } else {
        const id = await createPin({
          parentLocation,
          name,
          address,
          lat: position.lat,
          lng: position.lng,
          parkingInfo,
          shootingSpots,
          ipTransmissionInfo,
          fpuInfo,
          hazards,
          photos,
          shootingPhotos,
          hazardPhotos,
          organizationId: profile.organizationId,
          category: profile.category,
          recordedBy: profile.name,
        });
        setConfirmOpen(false);
        setToast({ type: "success", message: "現場を登録しました" });
        setTimeout(() => router.push(`/pin/${id}`), 600);
      }
    } catch (err) {
      console.error(err);
      setSubmitting(false);
      setToast({
        type: "error",
        message: "登録に失敗しました。時間をおいて再度お試しください",
      });
    }
  }

  const confirmSummary = [
    { label: "現場名", value: name },
    { label: "住所", value: address },
    {
      label: "位置",
      value: position
        ? `緯度 ${position.lat.toFixed(5)} / 経度 ${position.lng.toFixed(5)}`
        : "",
    },
    { label: "駐車場所", value: parkingInfo },
    { label: "撮影ポイント", value: shootingSpots },
    { label: "携帯回線(IP伝送)の状況", value: ipTransmissionInfo },
    { label: "FPU伝送の状況", value: fpuInfo },
    { label: "危険箇所・注意事項", value: hazards },
  ];

  return (
    <>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <ConfirmDialog
        open={confirmOpen}
        title={isEdit ? "この内容で更新しますか?" : "この内容で登録しますか?"}
        summary={confirmSummary}
        confirmLabel={isEdit ? "この内容で更新する" : "この内容で登録する"}
        submitting={submitting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmedSubmit}
      />
      <form onSubmit={handleOpenConfirm} className="max-w-2xl mx-auto p-5 sm:p-10 space-y-8 pb-32">
        <Section title="基本情報">
          <Field label="現場名" required>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 東京駅 丸の内口(入力すると地図に自動でピンが立ちます)"
              className={inputClass}
            />
            {nameSearching && (
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <Spinner className="w-3 h-3" /> 場所を検索中...
              </p>
            )}
          </Field>
          <Field label="代表地名・建物名">
            <input
              value={parentLocation}
              onChange={(e) => setParentLocation(e.target.value)}
              placeholder="例: 国立競技場、財務省、霞が関（グループ化に使用）"
              className={inputClass}
            />
            <p className="text-xs text-gray-400 mt-1">
              複数の現場を同じ建物や地名でまとめる場合に入力してください（省略可）
            </p>
          </Field>
          <Field label="住所" required>
            <input
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="現場名の入力や地図クリックで自動入力されます"
              className={inputClass}
            />
            {addressLoading && (
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <Spinner className="w-3 h-3" /> 住所を取得中...
              </p>
            )}
          </Field>
        </Section>

        <Section
          title="地図上の位置"
          description="現場名を入力するか、地図をクリックして正確な位置を指定してください"
        >
          <LocationPicker value={position} onChange={handlePositionChange} />
          {position ? (
            <p className="text-xs text-gray-500">
              緯度: {position.lat.toFixed(5)} / 経度: {position.lng.toFixed(5)}
            </p>
          ) : (
            <p className="text-xs text-amber-600">まだ位置が選択されていません</p>
          )}
        </Section>

        <Section title="現場情報" description="分かる範囲でOKです">
          <Field label="駐車場所">
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleInsertCurrentLocationToParking}
                disabled={parkingGpsLoading}
                className="flex items-center gap-1.5 text-sm font-medium text-blue-600 border border-blue-200 bg-blue-50 rounded-lg px-3 py-1.5 hover:bg-blue-100 hover:border-blue-300 hover:shadow-sm active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
              >
                {parkingGpsLoading ? (
                  <Spinner className="w-4 h-4" />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                  </svg>
                )}
                {parkingGpsLoading ? "現在地を取得中..." : "現在地の住所を挿入"}
              </button>
              <textarea
                value={parkingInfo}
                onChange={(e) => setParkingInfo(e.target.value)}
                placeholder="例: 敷地内に3台分あり。満車時は近くのコインパーキングを利用。実際の駐車スペースにいる時は上のボタンで現在地を追加できます"
                className={inputClass}
                rows={3}
              />
            </div>
          </Field>
          <Field label="撮影ポイント">
            <div className="space-y-3">
              <textarea
                value={shootingSpots}
                onChange={(e) => setShootingSpots(e.target.value)}
                placeholder="例: 正面玄関から見上げるアングルが撮りやすい"
                className={inputClass}
                rows={2}
              />
              <PhotoPicker
                label="撮影ポイントの写真"
                files={shootingPhotos}
                onChange={setShootingPhotos}
                existingUrls={existingPin?.shootingPhotoUrls}
              />
            </div>
          </Field>

          <div className="border-t border-gray-100 pt-6">
            <p className="text-sm font-medium text-gray-700 mb-1.5">伝送状況</p>
            <p className="text-xs text-gray-500 mb-2">
              実際に伝送を試した記録を残すと、次にこの現場へ行く人の判断材料になります。行く前の目安として、
              <a
                href="https://www.nttdocomo.co.jp/support/area/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                docomo
              </a>
              {" / "}
              <a
                href="https://www.au.com/mobile/area/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                au
              </a>
              {" / "}
              <a
                href="https://www.softbank.jp/mobile/network/area/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                SoftBank
              </a>
              の公式エリアマップも参考にどうぞ(あくまで目安です。検索欄に住所を手入力してください)
            </p>
            <div className="space-y-4">
              <Field label="携帯回線(IP伝送)の状況">
                <textarea
                  value={ipTransmissionInfo}
                  onChange={(e) => setIpTransmissionInfo(e.target.value)}
                  placeholder="例: 3キャリアボンディングで安定。屋内は不安定になりやすい"
                  className={inputClass}
                  rows={2}
                />
              </Field>
              <Field label="FPU伝送の状況">
                <textarea
                  value={fpuInfo}
                  onChange={(e) => setFpuInfo(e.target.value)}
                  placeholder="例: ○○中継局への見通しあり。ビル影になる位置は不可"
                  className={inputClass}
                  rows={2}
                />
              </Field>
            </div>
          </div>

          <Field label="危険箇所・注意事項">
            <div className="space-y-3">
              <textarea
                value={hazards}
                onChange={(e) => setHazards(e.target.value)}
                placeholder="例: 前面道路は交通量が多く、機材搬入時は要注意"
                className={inputClass}
                rows={2}
              />
              <PhotoPicker
                label="危険箇所の写真"
                files={hazardPhotos}
                onChange={setHazardPhotos}
                existingUrls={existingPin?.hazardPhotoUrls}
              />
            </div>
          </Field>
        </Section>

        <Section title="写真(現場全体)">
          <PhotoPicker
            label="現場全体の写真"
            files={photos}
            onChange={setPhotos}
            existingUrls={existingPin?.photoUrls}
          />
        </Section>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 sm:static sm:border-0 sm:p-0 sm:bg-transparent">
          <button
            type="submit"
            className="w-full max-w-2xl mx-auto flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-3 font-medium shadow-sm hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150"
          >
            {isEdit ? "内容を確認して更新する" : "内容を確認して登録する"}
          </button>
        </div>
      </form>
    </>
  );
}
