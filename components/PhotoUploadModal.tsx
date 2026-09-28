"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Car, Copy, Info as InfoIcon, Utensils } from "lucide-react";
import { createPhotoSpot } from "@/lib/photoSpots";
import {
  PHOTO_SPOT_EQUIPMENT_TAGS,
  PHOTO_SPOT_SUBJECT_TAGS,
  type PhotoSpotEquipmentTag,
  type PhotoSpotSubjectTag,
  type PhotoSpotTimeOfDay,
} from "@/lib/types/photoSpot";
import { geocodeQueryPoi, reverseGeocodePoi, type PoiGeocodeResult } from "@/lib/geocode";
import { parseExif } from "@/lib/exifParser";
import { useAuth } from "@/components/AuthProvider";
import { Capacitor } from "@capacitor/core";
import { pickPhotosFromLibrary } from "@/lib/nativePhotoPicker";

// LeafletはSSR非対応なのでクライアント側のみで読み込む(app/page.tsxと同様)
const LocationPicker = dynamic(() => import("@/components/LocationPicker"), { ssr: false });

const TIME_OF_DAY_OPTIONS: PhotoSpotTimeOfDay[] = ["早朝", "昼", "夕景", "夜景"];

type Props = {
  onClose: () => void;
  onCreated: () => void; // 投稿完了後、呼び出し元でギャラリーを再取得させるためのコールバック
  // 呼び出し元(フッターの「投稿」)で既に端末の写真アルバムから選択済みの画像。
  // 指定された場合、モーダル表示直後に自動的に取り込む。
  initialFiles?: File[];
};

// 写真1枚ごとの撮影場所・撮影設定(Exif由来、または手入力)。
// カルーセルで表示中の写真を切り替えると、この単位でフォーム表示も切り替わる。
type PhotoData = {
  position: { lat: number; lng: number } | null;
  positionSource: "exif" | "manual" | null;
  // 場所名(施設名・POI名を優先。位置情報からの逆ジオコーディング自動入力、
  // または手動入力・検索結果選択で決まる。ユーザーが自由に編集できる主フィールド)
  locationName: string;
  // 正式な住所。POI優先ジオコーディングで取得できた場合のみ裏で保持する
  // (Firestoreへは photos[].address として保存され、locationNameとは区別する)
  formalAddress: string;
  // 周辺情報(フリーテキスト。任意)
  parkingInfo: string;
  diningInfo: string;
  otherInfo: string;
  camera: string;
  lens: string;
  fNumber: string;
  exposureTime: string;
  iso: string;
  focalLength: string;
  timeOfDay: PhotoSpotTimeOfDay | "";
  autoFilled: boolean;
};

type PreviewPhoto = {
  file: File;
  url: string;
  exifChecking: boolean;
  data: PhotoData;
};

function emptyPhotoData(): PhotoData {
  return {
    position: null,
    positionSource: null,
    locationName: "",
    formalAddress: "",
    parkingInfo: "",
    diningInfo: "",
    otherInfo: "",
    camera: "",
    lens: "",
    fNumber: "",
    exposureTime: "",
    iso: "",
    focalLength: "",
    timeOfDay: "",
    autoFilled: false,
  };
}

// 「ここトレ！」は"スポット登録"ではなく"写真の投稿"を主軸とするPhoto-Firstな
// フローにする: 写真を選ぶと、その写真のEXIF GPS情報があれば撮影場所を
// 自動セットし、なければ「この位置で撮影した」と地図タップで手動設定する
// ステップに進む。スポット名等はあくまで写真に添える補足情報という位置づけ。
//
// PhotoSpot(Firestore)のスキーマは投稿1件につき撮影場所/撮影設定を1組しか
// 持たないため、複数枚を選んだ場合は「現在カルーセルに表示中の写真」のデータを
// 投稿全体の代表値として送信する(各写真ごとのプレビュー・編集はUI上のみ)。
export default function PhotoUploadModal({ onClose, onCreated, initialFiles }: Props) {
  const { photoProfile } = useAuth();
  const [photos, setPhotos] = useState<PreviewPhoto[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const suppressScrollSync = useRef(false);
  const replaceOnNextPickRef = useRef(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [addressResults, setAddressResults] = useState<PoiGeocodeResult[]>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);

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

  const currentPhoto: PreviewPhoto | undefined = photos[currentIndex];

  function updatePhotoData(index: number, patch: Partial<PhotoData>) {
    setPhotos((prev) =>
      prev.map((p, i) => (i === index ? { ...p, data: { ...p.data, ...patch } } : p))
    );
  }

  // 新しく選んだ写真を取り込む。既定では既存の写真を保持したまま末尾に追加するが、
  // replaceExisting指定時は現在の選択を全て破棄してから取り込む(「写真を変更」用)。
  // 各写真ごとに個別にExifを解析し、対応するインデックスのデータだけを更新する。
  async function addFiles(files: FileList | File[], options?: { replaceExisting?: boolean }) {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    const next: PreviewPhoto[] = imageFiles.map((file) => ({
      file,
      url: URL.createObjectURL(file),
      exifChecking: true,
      data: emptyPhotoData(),
    }));
    // setPhotosの更新関数内でstartIndexを確定させる(stateのクロージャの古さに
    // 依存しないようにするため。特にreplaceExisting時はここで確実に0になる)。
    let startIndex = 0;
    setPhotos((prev) => {
      if (options?.replaceExisting) {
        prev.forEach((p) => URL.revokeObjectURL(p.url));
        startIndex = 0;
        return next;
      }
      startIndex = prev.length;
      return [...prev, ...next];
    });
    // 新しく追加した写真(の先頭)をファーストビューに表示する
    setCurrentIndex(startIndex);

    await Promise.all(
      imageFiles.map(async (file, offset) => {
        const targetIndex = startIndex + offset;
        const parsed = await parseExif(file);
        setPhotos((prev) =>
          prev.map((p, i) => {
            if (i !== targetIndex) return p;
            const data: PhotoData = { ...p.data };
            if (parsed.camera) data.camera = parsed.camera;
            if (parsed.lens) data.lens = parsed.lens;
            if (parsed.fNumber != null) data.fNumber = String(parsed.fNumber);
            if (parsed.exposureTime) data.exposureTime = parsed.exposureTime;
            if (parsed.iso != null) data.iso = String(parsed.iso);
            if (parsed.focalLength) data.focalLength = parsed.focalLength;
            if (parsed.timeOfDay) data.timeOfDay = parsed.timeOfDay;
            if (parsed.position) {
              data.position = parsed.position;
              data.positionSource = "exif";
            }
            data.autoFilled = Boolean(
              parsed.camera ||
                parsed.lens ||
                parsed.fNumber != null ||
                parsed.exposureTime ||
                parsed.iso != null ||
                parsed.focalLength ||
                parsed.timeOfDay ||
                parsed.position
            );
            return { ...p, exifChecking: false, data };
          })
        );

        // 写真のExifに位置情報があれば、施設名(POI)優先の逆ジオコーディングで
        // 場所名を推測し場所名欄へ自動セットする(ユーザーが既に入力済みの
        // 場合は上書きしない)。正式住所も裏で一緒に保持しておく。
        if (parsed.position) {
          const place = await reverseGeocodePoi(parsed.position.lat, parsed.position.lng);
          if (place) {
            setPhotos((prev) =>
              prev.map((p, i) =>
                i === targetIndex && !p.data.locationName
                  ? { ...p, data: { ...p.data, locationName: place.locationName, formalAddress: place.address } }
                  : p
              )
            );
          }
        }
      })
    );
  }

  // フッターの「投稿」タップで既に選択済みの画像がある場合、モーダルを開いた
  // 直後に自動的に取り込む(手動でのタップ操作を待たない)
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      addFiles(initialFiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // currentIndexが変わったら(スワイプ以外の理由、例えば追加直後)カルーセルをその位置へ揃える
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const width = el.clientWidth;
    suppressScrollSync.current = true;
    el.scrollTo({ left: currentIndex * width, behavior: "smooth" });
    window.setTimeout(() => {
      suppressScrollSync.current = false;
    }, 400);
  }, [currentIndex, photos.length]);

  // ユーザーが横スワイプしてカルーセルの表示中の写真が変わったら、
  // 場所・撮影設定パネルの表示対象をそのインデックスへ切り替える
  function handleCarouselScroll() {
    if (suppressScrollSync.current) return;
    const el = carouselRef.current;
    if (!el || el.clientWidth === 0) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    if (index !== currentIndex && index >= 0 && index < photos.length) {
      setCurrentIndex(index);
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== index);
    });
    setCurrentIndex((prev) => Math.max(0, Math.min(prev, photos.length - 2)));
  }

  // 「＋枚数追加」「写真を変更」ボタン: アプリ(Capacitor)環境では複数選択対応の
  // FilePickerを直接開き、Webブラウザ環境では従来通り<input type="file">を開く。
  // replaceExisting指定時は取り込み時に既存の選択を破棄する(「写真を変更」用)。
  async function handleOpenPicker(options?: { replaceExisting?: boolean }) {
    if (Capacitor.isNativePlatform()) {
      const files = await pickPhotosFromLibrary();
      if (files.length > 0) await addFiles(files, options);
      return;
    }
    replaceOnNextPickRef.current = Boolean(options?.replaceExisting);
    fileInputRef.current?.click();
  }

  // 場所名欄に入力された施設名・地名(例: 「井の頭恩賜公園」)で検索し、
  // 位置情報・正式住所の候補を取得する(順ジオコーディング)。
  async function handleAddressSearch() {
    const query = currentPhoto?.data.locationName.trim();
    if (!query) return;
    setSearchingAddress(true);
    setError("");
    try {
      const results = await geocodeQueryPoi(query);
      setAddressResults(results);
    } catch {
      setError("場所の検索に失敗しました");
    } finally {
      setSearchingAddress(false);
    }
  }

  function selectAddressResult(result: PoiGeocodeResult) {
    updatePhotoData(currentIndex, {
      locationName: result.locationName,
      formalAddress: result.address,
      position: { lat: result.lat, lng: result.lng },
      positionSource: "manual",
    });
    setAddressResults([]);
  }

  // 地図タップ等で手動設定した位置に、まだ場所名が入力されていなければ
  // 施設名(POI)優先の逆ジオコーディングで場所名を自動セットする。
  async function handleManualPositionChange(index: number, pos: { lat: number; lng: number }) {
    updatePhotoData(index, { position: pos, positionSource: "manual" });
    const place = await reverseGeocodePoi(pos.lat, pos.lng);
    if (place) {
      setPhotos((prev) =>
        prev.map((p, i) =>
          i === index && !p.data.locationName
            ? { ...p, data: { ...p.data, locationName: place.locationName, formalAddress: place.address } }
            : p
        )
      );
    }
  }

  // 「1枚目の場所・情報をコピー」: 複数枚投稿時、2枚目以降の入力の手間を
  // 減らすため、先頭の写真の場所名・位置情報・住所・周辺情報をそのまま転記する。
  // 転記後もユーザーは自由に上書き修正できる(通常のupdatePhotoDataと同じ欄を使う)。
  function copyLocationFromFirstPhoto(index: number) {
    const first = photos[0];
    if (!first || index === 0) return;
    updatePhotoData(index, {
      position: first.data.position,
      positionSource: first.data.positionSource,
      locationName: first.data.locationName,
      formalAddress: first.data.formalAddress,
      parkingInfo: first.data.parkingInfo,
      diningInfo: first.data.diningInfo,
      otherInfo: first.data.otherInfo,
    });
  }

  async function handleSubmit() {
    if (!photoProfile) return;
    if (photos.length === 0) {
      setError("まずは写真を選択してください");
      return;
    }
    // 各写真ごとに個別の撮影場所を保存するため、全ての写真に位置情報が
    // 設定されている必要がある(未設定の写真があればスワイプして設定を促す)。
    const missingIndex = photos.findIndex((p) => !p.data.position);
    if (missingIndex !== -1) {
      setCurrentIndex(missingIndex);
      setError(
        photos.length > 1
          ? `${missingIndex + 1}枚目の写真の撮影場所を地図でタップして設定してください`
          : "この写真を撮影した場所を地図でタップして設定してください"
      );
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await createPhotoSpot({
        // タイトル未入力時は代表(先頭)の写真の場所名を代替表示に使う。それも
        // 無ければ空欄のままにする(「無題の写真」等の固定文言は表示しない)。
        name: name.trim() || photos[0].data.locationName.trim(),
        description: description.trim() || undefined,
        accessNote: accessNote.trim() || undefined,
        subjectTags: subjectTags.length > 0 ? subjectTags : undefined,
        equipmentTags: equipmentTags.length > 0 ? equipmentTags : undefined,
        isFree,
        allowCommercial,
        // 写真ごとの位置情報・撮影条件をそれぞれ個別に紐付けて保存する
        photos: photos.map((p) => ({
          file: p.file,
          lat: p.data.position!.lat,
          lng: p.data.position!.lng,
          locationName: p.data.locationName.trim(),
          address: p.data.formalAddress.trim() || undefined,
          parkingInfo: p.data.parkingInfo.trim() || undefined,
          diningInfo: p.data.diningInfo.trim() || undefined,
          otherInfo: p.data.otherInfo.trim() || undefined,
          cameraGear: {
            camera: p.data.camera.trim() || undefined,
            lens: p.data.lens.trim() || undefined,
          },
          exif: {
            fNumber: p.data.fNumber.trim() ? Number(p.data.fNumber) : undefined,
            exposureTime: p.data.exposureTime.trim() || undefined,
            iso: p.data.iso.trim() ? Number(p.data.iso) : undefined,
            focalLength: p.data.focalLength.trim() || undefined,
            timeOfDay: p.data.timeOfDay || undefined,
          },
        })),
        postedBy: photoProfile.uid,
        postedByName: photoProfile.displayName,
      });
      onCreated();
      onClose();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      console.error("Upload Error:", { code, error: e });
      if (code === "storage/unauthorized" || code === "permission-denied") {
        setError("権限がないため投稿できませんでした。再度ログインしてからお試しください");
      } else if (code === "storage/canceled") {
        setError("アップロードが中断されました。もう一度お試しください");
      } else if (e instanceof Error && e.message) {
        setError(e.message);
      } else {
        setError("投稿に失敗しました。時間をおいて再度お試しください");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-4 overflow-x-hidden">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden shadow-xl">
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

        <div className="p-5 pb-24 space-y-6 w-full max-w-full overflow-x-hidden" style={{ touchAction: "pan-y" }}>
          {/* 写真プレビュー: 選択済みならカルーセルをファーストビューに直接表示する */}
          <div className="w-full max-w-full">
            {photos.length > 0 ? (
              <>
                <div className="relative w-full max-w-full">
                  <div
                    ref={carouselRef}
                    onScroll={handleCarouselScroll}
                    className="flex w-full max-w-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory rounded-xl bg-gray-100"
                    style={{
                      touchAction: "pan-x",
                      overscrollBehaviorX: "contain",
                      overscrollBehaviorY: "none",
                      scrollbarWidth: "none",
                    }}
                  >
                    {photos.map((p, i) => (
                      <div key={p.url} className="relative w-full min-w-0 flex-shrink-0 snap-center h-64">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.url}
                          alt=""
                          className="block w-full h-full object-contain bg-gray-100"
                        />
                        <button
                          onClick={() => removePhoto(i)}
                          className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-6 h-6 text-sm flex items-center justify-center"
                          aria-label="この写真を削除"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* 前後の写真へ切り替える左右矢印(2枚目以降が存在する場合のみ表示) */}
                  {photos.length > 1 && (
                    <>
                      {currentIndex > 0 && (
                        <button
                          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                          aria-label="前の写真"
                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg"
                        >
                          ‹
                        </button>
                      )}
                      {currentIndex < photos.length - 1 && (
                        <button
                          onClick={() => setCurrentIndex((i) => Math.min(photos.length - 1, i + 1))}
                          aria-label="次の写真"
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg"
                        >
                          ›
                        </button>
                      )}
                    </>
                  )}
                </div>

                {photos.length > 1 && (
                  <div className="flex justify-center gap-1.5 mt-2">
                    {photos.map((p, i) => (
                      <button
                        key={p.url}
                        onClick={() => setCurrentIndex(i)}
                        aria-label={`${i + 1}枚目を表示`}
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${
                          i === currentIndex ? "bg-orange-500" : "bg-gray-300"
                        }`}
                      />
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 mt-3">
                  <p className="text-xs text-gray-400">
                    {photos.length}枚選択中(スワイプで切り替え・{currentIndex + 1}枚目を編集中)
                  </p>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleOpenPicker()}
                      className="text-xs font-semibold text-orange-600 hover:text-orange-700 border border-orange-200 rounded-full px-3 py-1.5"
                    >
                      ＋ 枚数追加
                    </button>
                    <button
                      onClick={() => handleOpenPicker({ replaceExisting: true })}
                      className="text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 rounded-full px-3 py-1.5"
                    >
                      写真を変更
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div
                onClick={() => handleOpenPicker()}
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors border-gray-300 hover:border-gray-400"
              >
                <p className="text-sm text-gray-500">タップして写真を選択(複数選択可)</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files, { replaceExisting: replaceOnNextPickRef.current });
                replaceOnNextPickRef.current = false;
                e.target.value = "";
              }}
            />
          </div>

          {/* 写真が選ばれるまでは、場所・撮影データ入力を表示しない(Photo-First) */}
          {currentPhoto && (
            <>
              {/* STEP2: 撮影場所の設定(写真から自動セット、なければ地図タップ) */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="block text-sm font-semibold text-gray-700">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 text-white text-[10px] font-bold mr-1.5 align-middle">
                      2
                    </span>
                    撮影した場所{photos.length > 1 ? `(${currentIndex + 1}枚目)` : ""}
                  </label>
                  {/* 複数枚投稿時、2枚目以降は1枚目の場所・周辺情報をワンタップで
                      転記できる(転記後も自由に上書き修正可能) */}
                  {photos.length > 1 && currentIndex > 0 && (
                    <button
                      onClick={() => copyLocationFromFirstPhoto(currentIndex)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-orange-600 hover:text-orange-700 border border-orange-200 rounded-full px-2.5 py-1 flex-shrink-0"
                    >
                      <Copy size={11} strokeWidth={2} />
                      1枚目の場所・情報をコピー
                    </button>
                  )}
                </div>

                {currentPhoto.exifChecking && (
                  <p className="text-xs text-gray-400 mb-2">写真のExif情報を解析しています...</p>
                )}
                {!currentPhoto.exifChecking && currentPhoto.data.positionSource === "exif" && (
                  <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-2">
                    写真の位置情報(Exif)から撮影場所を自動セットしました。ズレている場合は地図をタップして修正できます。
                  </p>
                )}
                {!currentPhoto.exifChecking && !currentPhoto.data.position && (
                  <p className="text-xs text-gray-500 mb-2">
                    写真に位置情報が見つかりませんでした(SNS保存画像等はExifが失われていることがあります)。地図をタップして「この位置で撮影した」場所を選んでください。
                  </p>
                )}

                <label className="block text-xs font-semibold text-gray-500 mb-1">場所名</label>
                <div className="flex gap-2 mb-1">
                  <input
                    type="text"
                    value={currentPhoto.data.locationName}
                    onChange={(e) => updatePhotoData(currentIndex, { locationName: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && handleAddressSearch()}
                    placeholder="施設名・場所名(例: 井の頭恩賜公園。位置情報から自動入力されます)"
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
                {/* 裏で保持している正式住所(取得できた場合のみ表示。参考情報) */}
                {currentPhoto.data.formalAddress && (
                  <p className="text-[11px] text-gray-400 mb-2 truncate">{currentPhoto.data.formalAddress}</p>
                )}
                {addressResults.length > 0 && (
                  <ul className="border border-gray-200 rounded-lg mb-2 divide-y divide-gray-100 max-h-40 overflow-y-auto">
                    {addressResults.map((r, i) => (
                      <li key={i}>
                        <button
                          onClick={() => selectAddressResult(r)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50"
                        >
                          <p className="text-xs font-medium text-gray-800 truncate">{r.locationName}</p>
                          <p className="text-[11px] text-gray-400 truncate">{r.address}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-gray-400 mb-2">
                  地図をタップ/クリックして「この位置で撮影した」場所を設定・微調整できます
                </p>
                <LocationPicker
                  value={currentPhoto.data.position}
                  onChange={(pos) => handleManualPositionChange(currentIndex, pos)}
                  heightClassName="h-52"
                />

                {/* 周辺情報(駐車場・飲食店等。任意のフリーテキスト) */}
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-500">周辺情報(任意)</p>
                  <div className="flex items-center gap-2">
                    <Car size={14} strokeWidth={2} className="text-gray-400 flex-shrink-0" />
                    <input
                      type="text"
                      value={currentPhoto.data.parkingInfo}
                      onChange={(e) => updatePhotoData(currentIndex, { parkingInfo: e.target.value })}
                      placeholder="駐車場情報(例: 無料駐車場あり・20台)"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Utensils size={14} strokeWidth={2} className="text-gray-400 flex-shrink-0" />
                    <input
                      type="text"
                      value={currentPhoto.data.diningInfo}
                      onChange={(e) => updatePhotoData(currentIndex, { diningInfo: e.target.value })}
                      placeholder="周辺飲食店・カフェ情報(例: 徒歩3分にカフェあり)"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <InfoIcon size={14} strokeWidth={2} className="text-gray-400 flex-shrink-0" />
                    <input
                      type="text"
                      value={currentPhoto.data.otherInfo}
                      onChange={(e) => updatePhotoData(currentIndex, { otherInfo: e.target.value })}
                      placeholder="その他補足(トイレの有無、徒歩アクセス等)"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* STEP3: 撮影設定・機材メモ */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 text-white text-[10px] font-bold mr-1.5 align-middle">
                    3
                  </span>
                  撮影設定・機材メモ(任意){photos.length > 1 ? `(${currentIndex + 1}枚目)` : ""}
                </label>
                {currentPhoto.data.autoFilled && (
                  <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-2">
                    写真のExifから自動入力しました。内容が異なる場合はそのまま編集してください。
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={currentPhoto.data.camera}
                    onChange={(e) => updatePhotoData(currentIndex, { camera: e.target.value })}
                    placeholder="カメラ機種"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={currentPhoto.data.lens}
                    onChange={(e) => updatePhotoData(currentIndex, { lens: e.target.value })}
                    placeholder="レンズ"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={currentPhoto.data.fNumber}
                    onChange={(e) => updatePhotoData(currentIndex, { fNumber: e.target.value })}
                    placeholder="F値(例: 2.8)"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={currentPhoto.data.exposureTime}
                    onChange={(e) => updatePhotoData(currentIndex, { exposureTime: e.target.value })}
                    placeholder="シャッタースピード(例: 1/250)"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={currentPhoto.data.iso}
                    onChange={(e) => updatePhotoData(currentIndex, { iso: e.target.value })}
                    placeholder="ISO感度"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={currentPhoto.data.focalLength}
                    onChange={(e) => updatePhotoData(currentIndex, { focalLength: e.target.value })}
                    placeholder="焦点距離(例: 35mm)"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {TIME_OF_DAY_OPTIONS.map((t) => (
                    <button
                      key={t}
                      onClick={() =>
                        updatePhotoData(currentIndex, {
                          timeOfDay: currentPhoto.data.timeOfDay === t ? "" : t,
                        })
                      }
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        currentPhoto.data.timeOfDay === t
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
