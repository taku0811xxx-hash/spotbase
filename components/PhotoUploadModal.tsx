"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createPhotoSpot } from "@/lib/photoSpots";
import {
  PHOTO_SPOT_EQUIPMENT_TAGS,
  PHOTO_SPOT_SUBJECT_TAGS,
  type PhotoSpotEquipmentTag,
  type PhotoSpotSubjectTag,
  type PhotoSpotTimeOfDay,
} from "@/lib/types/photoSpot";
import { geocodeQuery, type GeocodeResult } from "@/lib/geocode";
import { parseExif } from "@/lib/exifParser";
import { useAuth } from "@/components/AuthProvider";

// LeafletはSSR非対応なのでクライアント側のみで読み込む(app/page.tsxと同様)
const LocationPicker = dynamic(() => import("@/components/LocationPicker"), { ssr: false });

const TIME_OF_DAY_OPTIONS: PhotoSpotTimeOfDay[] = ["早朝", "昼", "夕景", "夜景"];

type Props = {
  onClose: () => void;
  onCreated: () => void; // 投稿完了後、呼び出し元でギャラリーを再取得させるためのコールバック
};

type PreviewPhoto = {
  file: File;
  url: string;
};

// 「ここトレ！」は"スポット登録"ではなく"写真の投稿"を主軸とするPhoto-Firstな
// フローにする: STEP1で写真を選ぶと、その写真のEXIF GPS情報があれば撮影場所を
// 自動セットし、なければ「この位置で撮影した」と地図タップで手動設定する
// STEP2に進む。スポット名等はあくまで写真に添える補足情報という位置づけ。
export default function PhotoUploadModal({ onClose, onCreated }: Props) {
  const { photoProfile } = useAuth();
  const [photos, setPhotos] = useState<PreviewPhoto[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [addressQuery, setAddressQuery] = useState("");
  const [addressResults, setAddressResults] = useState<GeocodeResult[]>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [address, setAddress] = useState("");
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [positionSource, setPositionSource] = useState<"exif" | "manual" | null>(null);
  const [checkingExif, setCheckingExif] = useState(false);
  const [exifAutoFilled, setExifAutoFilled] = useState(false);

  const [camera, setCamera] = useState("");
  const [lens, setLens] = useState("");
  const [fNumber, setFNumber] = useState("");
  const [exposureTime, setExposureTime] = useState("");
  const [iso, setIso] = useState("");
  const [focalLength, setFocalLength] = useState("");
  const [timeOfDay, setTimeOfDay] = useState<PhotoSpotTimeOfDay | "">("");

  const [accessNote, setAccessNote] = useState("");
  const [subjectTags, setSubjectTags] = useState<PhotoSpotSubjectTag[]>([]);
  const [equipmentTags, setEquipmentTags] = useState<PhotoSpotEquipmentTag[]>([]);
  const [isFree, setIsFree] = useState(false);
  const [allowCommercial, setAllowCommercial] = useState(false);

  function toggleTag<T>(list: T[], setList: (v: T[]) => void, value: T) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function addFiles(files: FileList | File[]) {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    const next = imageFiles.map((file) => ({ file, url: URL.createObjectURL(file) }));
    const isFirstBatch = photos.length === 0;
    setPhotos((prev) => [...prev, ...next]);

    // 最初の1枚のExif(カメラ・レンズ・撮影設定・撮影時間帯・GPS位置)を解析し、
    // 対応するフォーム項目が未入力の場合のみ自動反映する(SNS保存画像等、
    // Exifが失われている場合は何も反映されず、そのまま手入力できる)。
    if (isFirstBatch) {
      setCheckingExif(true);
      try {
        const parsed = await parseExif(imageFiles[0]);
        if (parsed.camera) setCamera((v) => v || parsed.camera!);
        if (parsed.lens) setLens((v) => v || parsed.lens!);
        if (parsed.fNumber != null) setFNumber((v) => v || String(parsed.fNumber));
        if (parsed.exposureTime) setExposureTime((v) => v || parsed.exposureTime!);
        if (parsed.iso != null) setIso((v) => v || String(parsed.iso));
        if (parsed.focalLength) setFocalLength((v) => v || parsed.focalLength!);
        if (parsed.timeOfDay) setTimeOfDay((v) => v || parsed.timeOfDay!);
        if (parsed.position && !position) {
          setPosition(parsed.position);
          setPositionSource("exif");
        }
        setExifAutoFilled(
          Boolean(
            parsed.camera ||
              parsed.lens ||
              parsed.fNumber != null ||
              parsed.exposureTime ||
              parsed.iso != null ||
              parsed.focalLength ||
              parsed.timeOfDay ||
              parsed.position
          )
        );
      } finally {
        setCheckingExif(false);
      }
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleAddressSearch() {
    if (!addressQuery.trim()) return;
    setSearchingAddress(true);
    setError("");
    try {
      const results = await geocodeQuery(addressQuery);
      setAddressResults(results);
    } catch {
      setError("住所検索に失敗しました");
    } finally {
      setSearchingAddress(false);
    }
  }

  function selectAddressResult(result: GeocodeResult) {
    setAddress(result.displayName);
    setPosition({ lat: result.lat, lng: result.lng });
    setPositionSource("manual");
    setAddressResults([]);
    setAddressQuery(result.displayName);
  }

  async function handleSubmit() {
    if (!photoProfile) return;
    if (photos.length === 0) {
      setError("まずは写真を選択してください");
      return;
    }
    if (!position) {
      setError("この写真を撮影した場所を地図でタップして設定してください");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await createPhotoSpot({
        name: name.trim() || "無題の写真",
        description: description.trim() || undefined,
        address: address.trim() || addressQuery.trim(),
        lat: position.lat,
        lng: position.lng,
        accessNote: accessNote.trim() || undefined,
        subjectTags: subjectTags.length > 0 ? subjectTags : undefined,
        equipmentTags: equipmentTags.length > 0 ? equipmentTags : undefined,
        isFree,
        allowCommercial,
        cameraGear: {
          camera: camera.trim() || undefined,
          lens: lens.trim() || undefined,
        },
        exif: {
          fNumber: fNumber.trim() ? Number(fNumber) : undefined,
          exposureTime: exposureTime.trim() || undefined,
          iso: iso.trim() ? Number(iso) : undefined,
          focalLength: focalLength.trim() || undefined,
          timeOfDay: timeOfDay || undefined,
        },
        photos: photos.map((p) => p.file),
        postedBy: photoProfile.uid,
        postedByName: photoProfile.displayName,
      });
      onCreated();
      onClose();
    } catch (e) {
      console.error(e);
      setError("投稿に失敗しました。時間をおいて再度お試しください");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-lg font-bold text-gray-900">写真を投稿</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* STEP1: 写真アップロード(最優先ステップ) */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 text-white text-[10px] font-bold mr-1.5 align-middle">
                1
              </span>
              まずは写真を選ぶ(複数選択可)
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragOver ? "border-orange-400 bg-orange-50" : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <p className="text-sm text-gray-500">
                クリックして選択、またはドラッグ＆ドロップ
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {photos.map((p, i) => (
                  <div key={p.url} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removePhoto(i);
                      }}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 写真が選ばれるまでは、場所・撮影データ入力を表示しない(Photo-First) */}
          {photos.length > 0 && (
            <>
              {/* STEP2: 撮影場所の設定(写真から自動セット、なければ地図タップ) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 text-white text-[10px] font-bold mr-1.5 align-middle">
                    2
                  </span>
                  撮影した場所
                </label>

                {checkingExif && (
                  <p className="text-xs text-gray-400 mb-2">写真のExif情報を解析しています...</p>
                )}
                {!checkingExif && positionSource === "exif" && (
                  <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-2">
                    写真の位置情報(Exif)から撮影場所を自動セットしました。ズレている場合は地図をタップして修正できます。
                  </p>
                )}
                {!checkingExif && !position && (
                  <p className="text-xs text-gray-500 mb-2">
                    写真に位置情報が見つかりませんでした(SNS保存画像等はExifが失われていることがあります)。地図をタップして「この位置で撮影した」場所を選んでください。
                  </p>
                )}

                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={addressQuery}
                    onChange={(e) => setAddressQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddressSearch()}
                    placeholder="住所・地名で検索(任意)"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    onClick={handleAddressSearch}
                    disabled={searchingAddress}
                    className="px-3 py-2 text-sm rounded-lg bg-gray-800 text-white disabled:opacity-50"
                  >
                    {searchingAddress ? "検索中..." : "検索"}
                  </button>
                </div>
                {addressResults.length > 0 && (
                  <ul className="border border-gray-200 rounded-lg mb-2 divide-y divide-gray-100 max-h-32 overflow-y-auto">
                    {addressResults.map((r, i) => (
                      <li key={i}>
                        <button
                          onClick={() => selectAddressResult(r)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50"
                        >
                          {r.displayName}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-gray-400 mb-2">
                  地図をタップ/クリックして「この位置で撮影した」場所を設定・微調整できます
                </p>
                <LocationPicker
                  value={position}
                  onChange={(pos) => {
                    setPosition(pos);
                    setPositionSource("manual");
                  }}
                  heightClassName="h-56"
                />
              </div>

              {/* STEP3: 撮影設定・機材メモ */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 text-white text-[10px] font-bold mr-1.5 align-middle">
                    3
                  </span>
                  撮影設定・機材メモ(任意)
                </label>
                {exifAutoFilled && (
                  <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-2">
                    写真のExifから自動入力しました。内容が異なる場合はそのまま編集してください。
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={camera}
                    onChange={(e) => setCamera(e.target.value)}
                    placeholder="カメラ機種"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={lens}
                    onChange={(e) => setLens(e.target.value)}
                    placeholder="レンズ"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={fNumber}
                    onChange={(e) => setFNumber(e.target.value)}
                    placeholder="F値(例: 2.8)"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={exposureTime}
                    onChange={(e) => setExposureTime(e.target.value)}
                    placeholder="シャッタースピード(例: 1/250)"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={iso}
                    onChange={(e) => setIso(e.target.value)}
                    placeholder="ISO感度"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={focalLength}
                    onChange={(e) => setFocalLength(e.target.value)}
                    placeholder="焦点距離(例: 35mm)"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {TIME_OF_DAY_OPTIONS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTimeOfDay(timeOfDay === t ? "" : t)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        timeOfDay === t
                          ? "bg-orange-500 border-orange-500 text-white"
                          : "border-gray-300 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* STEP4: タイトル・説明・撮影アドバイス(任意の補足情報) */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-gray-700">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 text-white text-[10px] font-bold mr-1.5 align-middle">
                    4
                  </span>
                  写真についての補足(任意)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="タイトル(例: ○○神社の桜並木)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="おすすめの理由・構図のコツなど"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <textarea
                  value={accessNote}
                  onChange={(e) => setAccessNote(e.target.value)}
                  rows={2}
                  placeholder="撮影アドバイス(三脚利用の可否、許可申請の要否、足場の状況など)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />

                {/* ギャラリー・地図の絞り込み検索で使われるタグ(任意) */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">被写体・タグ</p>
                  <div className="flex gap-2 flex-wrap">
                    {PHOTO_SPOT_SUBJECT_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(subjectTags, setSubjectTags, tag)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          subjectTags.includes(tag)
                            ? "bg-orange-500 border-orange-500 text-white"
                            : "border-gray-300 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">機材・撮影条件</p>
                  <div className="flex gap-2 flex-wrap">
                    {PHOTO_SPOT_EQUIPMENT_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(equipmentTags, setEquipmentTags, tag)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          equipmentTags.includes(tag)
                            ? "bg-pink-500 border-pink-500 text-white"
                            : "border-gray-300 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 利用条件(ライセンス)設定 */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">利用条件</p>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={isFree}
                        onChange={(e) => setIsFree(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      無料ダウンロードを許可する
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={allowCommercial}
                        onChange={(e) => setAllowCommercial(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      商用利用を許可する
                    </label>
                  </div>
                </div>
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex justify-end gap-2 rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-sm hover:shadow-md disabled:opacity-50"
          >
            {submitting ? "投稿中..." : "写真を共有する"}
          </button>
        </div>
      </div>
    </div>
  );
}
