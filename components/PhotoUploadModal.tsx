"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Copy } from "lucide-react";
import {
  NEARBY_INFO_CHIPS,
  PHOTO_MEMO_CHIPS,
  splitChipsAndText,
  toggleChipInValue,
} from "@/lib/nearbyInfoChips";
import { createPhotoSpot } from "@/lib/photoSpots";
import type { PhotoSpotTimeOfDay, PhotoSpotVisibility } from "@/lib/types/photoSpot";
import { geocodeQueryPoi, reverseGeocodePoi, type PoiGeocodeResult } from "@/lib/geocode";
import { parseExif } from "@/lib/exifParser";
import { useAuth } from "@/components/AuthProvider";
import { Capacitor } from "@capacitor/core";
import { pickPhotosFromLibrary } from "@/lib/nativePhotoPicker";

// LeafletはSSR非対応なのでクライアント側のみで読み込む(app/page.tsxと同様)
const LocationPicker = dynamic(() => import("@/components/LocationPicker"), { ssr: false });

type Props = {
  onClose: () => void;
  onCreated: () => void; // 投稿完了後、呼び出し元でギャラリーを再取得させるためのコールバック
  // 呼び出し元(フッターの「投稿」)で既に端末の写真アルバムから選択済みの画像。
  // 指定された場合、モーダル表示直後に自動的に取り込む。
  initialFiles?: File[];
};

// 写真1枚ごとの撮影場所・撮影設定。投稿コストを最小化するため、UI上で
// ユーザーが直接入力する項目は「場所名(位置情報)」「写真のメモ・補足」
// 「周辺情報・アクセス」の3つに絞り込んでいる(機材・撮影設定は折りたたみ欄で任意修正可)。カメラ機種・レンズ・F値・
// シャッタースピード・ISO・焦点距離・撮影日時・時間帯はEXIFから自動抽出して
// 裏で保持するのみで、個別の編集フィールドは設けない。
type PhotoData = {
  position: { lat: number; lng: number } | null;
  positionSource: "exif" | "manual" | null;
  // 場所名(施設名・POI名を優先。位置情報からの逆ジオコーディング自動入力、
  // または手動入力・検索結果選択で決まる。ユーザーが自由に編集できる主フィールド)
  locationName: string;
  // 正式な住所。POI優先ジオコーディングで取得できた場合のみ裏で保持する
  // (Firestoreへは photos[].address として保存され、locationNameとは区別する)
  formalAddress: string;
  // この写真についての自由記述メモ・補足(1つの入力欄のみ)
  memo: string;
  // 周辺情報・アクセス(駐車場・飲食店など。1つの入力欄のみ)
  nearbyInfo: string;
  // 以下はEXIFから自動抽出して裏で保持するだけの値(編集UIは設けない)
  camera: string;
  lens: string;
  fNumber: string;
  exposureTime: string;
  iso: string;
  focalLength: string;
  timeOfDay: PhotoSpotTimeOfDay | "";
  shotAt: string; // 撮影日時(EXIFのDateTimeOriginal由来のISO文字列)
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
    memo: "",
    nearbyInfo: "",
    camera: "",
    lens: "",
    fNumber: "",
    exposureTime: "",
    iso: "",
    focalLength: "",
    timeOfDay: "",
    shotAt: "",
  };
}

// スリムな1つのテキスト欄構造は保ったまま、手入力の手間を減らすためのワン
// タップチップ行。タップでON/OFFをトグルし、選択状態はテキスト欄の内容
// (プリセット部分)から都度導出する(別のstateは持たない)。横スクロールで
// 折り返さず、フォームの縦長化を防ぐ。
function ChipRow({
  value,
  chips,
  onToggle,
  colorClass,
}: {
  value: string;
  chips: readonly string[];
  onToggle: (chip: string) => void;
  colorClass: string;
}) {
  const { selected } = splitChipsAndText(value, chips);
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 mb-1.5" style={{ scrollbarWidth: "none" }}>
      {chips.map((chip) => {
        const isSelected = selected.includes(chip);
        return (
          <button
            key={chip}
            type="button"
            onClick={() => onToggle(chip)}
            className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border whitespace-nowrap transition-colors ${
              isSelected ? `${colorClass} text-white` : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {chip}
          </button>
        );
      })}
    </div>
  );
}

// 「ここトレ！」は"スポット登録"ではなく"写真の投稿"を主軸とするPhoto-Firstな
// フローにする: 写真を選ぶと、その写真のEXIF GPS情報があれば撮影場所を
// 自動セットし、なければ「この位置で撮影した」と地図タップで手動設定する
// ステップに進む。
//
// PhotoSpot(Firestore)のスキーマは投稿1件につきタイトル/説明を1組しか
// 持たないため、複数枚を選んだ場合は「先頭の写真」の場所名を投稿タイトルの
// 代替表示に使う(各写真ごとの場所・メモ・周辺情報はphotos配列に個別保存)。
export default function PhotoUploadModal({ onClose, onCreated, initialFiles }: Props) {
  const { photoProfile } = useAuth();
  const [photos, setPhotos] = useState<PreviewPhoto[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const suppressScrollSync = useRef(false);
  const replaceOnNextPickRef = useRef(false);

  const [description, setDescription] = useState("");

  const [addressResults, setAddressResults] = useState<PoiGeocodeResult[]>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);

  // 公開範囲。デフォルトは「自分のみ(非公開)」にして投稿の心理的ハードルを
  // 下げ、全体公開したい場合のみ明示的に切り替えてもらう。
  const [visibility, setVisibility] = useState<PhotoSpotVisibility>("private");

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
            if (parsed.shotAt) data.shotAt = parsed.shotAt;
            if (parsed.position) {
              data.position = parsed.position;
              data.positionSource = "exif";
            }
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
      nearbyInfo: first.data.nearbyInfo,
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
        // タイトルは代表(先頭)の写真の場所名をそのまま使う(専用の入力欄は
        // 設けない)。場所名も無ければ空欄のままにする(「無題の写真」等の
        // 固定文言は表示しない)。
        name: photos[0].data.locationName.trim(),
        description: description.trim() || undefined,
        visibility,
        // 写真ごとの位置情報・メモ・周辺情報・撮影条件をそれぞれ個別に紐付けて保存する
        photos: photos.map((p) => ({
          file: p.file,
          lat: p.data.position!.lat,
          lng: p.data.position!.lng,
          locationName: p.data.locationName.trim(),
          address: p.data.formalAddress.trim() || undefined,
          memo: p.data.memo.trim() || undefined,
          otherInfo: p.data.nearbyInfo.trim() || undefined,
          cameraGear: {
            camera: p.data.camera.trim() || undefined,
            lens: p.data.lens.trim() || undefined,
          },
          exif: {
            fNumber: Number(p.data.fNumber.replace(/^f\/?/i, "")) || undefined,
            exposureTime: p.data.exposureTime.trim() || undefined,
            iso: Number(p.data.iso.replace(/^iso\s*/i, "")) || undefined,
            focalLength: p.data.focalLength.trim() || undefined,
            timeOfDay: p.data.timeOfDay || undefined,
            shotAt: p.data.shotAt || undefined,
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

          {/* 写真が選ばれるまでは、以降の入力を表示しない(Photo-First) */}
          {currentPhoto && (
            <>
              {/* 1. 公開設定: フォーム上部に配置。自分だけの備忘録として使いたい
                  場合の心理的ハードルを下げるため、デフォルトは「自分のみ(非公開)」。 */}
              <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 text-white text-[10px] font-bold mr-1.5 align-middle">
                    1
                  </span>
                  公開設定
                </p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="visibility"
                    checked={visibility === "private"}
                    onChange={() => setVisibility("private")}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-gray-700">
                    自分のみ(非公開メモ)
                    <span className="block text-xs text-gray-400">
                      自分だけの撮影ログ・備忘録として保存します(他のユーザーの地図には表示されません)
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="visibility"
                    checked={visibility === "public"}
                    onChange={() => setVisibility("public")}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-gray-700">
                    全体公開
                    <span className="block text-xs text-gray-400">みんなの検索地図にも表示します</span>
                  </span>
                </label>
              </div>

              {/* 2. 場所名・位置情報(写真から自動セット、なければ地図タップ) */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="block text-sm font-semibold text-gray-700">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 text-white text-[10px] font-bold mr-1.5 align-middle">
                      2
                    </span>
                    場所名・位置情報{photos.length > 1 ? `(${currentIndex + 1}枚目)` : ""}
                  </label>
                  {/* 複数枚投稿時、2枚目以降は1枚目の場所・周辺情報をワンタップで
                      転記できる(転記後も自由に上書き修正可能) */}
                  {photos.length > 1 && currentIndex > 0 && (
                    <button
                      onClick={() => copyLocationFromFirstPhoto(currentIndex)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-orange-600 hover:text-orange-700 border border-orange-200 rounded-full px-2.5 py-1 flex-shrink-0"
                    >
                      <Copy size={11} strokeWidth={2} />
                      1枚目の情報をコピー
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

                <div className="flex items-center gap-2 mb-1">
                  <input
                    type="text"
                    value={currentPhoto.data.locationName}
                    onChange={(e) => updatePhotoData(currentIndex, { locationName: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && handleAddressSearch()}
                    placeholder="施設名・場所名(例: 井の頭恩賜公園)"
                    className="flex-1 min-w-0 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    onClick={handleAddressSearch}
                    disabled={searchingAddress}
                    className="flex-shrink-0 whitespace-nowrap px-3 py-2 text-sm rounded-lg bg-gray-800 text-white disabled:opacity-50"
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
              </div>

              {/* 3. 写真のメモ・補足(1つの入力欄のみ。カメラ機種・レンズ・F値・
                  シャッタースピード・ISO・焦点距離・撮影日時・時間帯はEXIFから
                  自動取得して裏で保存するため、個別の入力欄は設けない) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 text-white text-[10px] font-bold mr-1.5 align-middle">
                    3
                  </span>
                  写真のメモ・補足(任意){photos.length > 1 ? `(${currentIndex + 1}枚目)` : ""}
                </label>
                <ChipRow
                  value={currentPhoto.data.memo}
                  chips={PHOTO_MEMO_CHIPS}
                  colorClass="bg-gray-700 border-gray-700"
                  onToggle={(chip) =>
                    updatePhotoData(currentIndex, { memo: toggleChipInValue(currentPhoto.data.memo, chip, PHOTO_MEMO_CHIPS) })
                  }
                />
                <textarea
                  value={currentPhoto.data.memo}
                  onChange={(e) => updatePhotoData(currentIndex, { memo: e.target.value })}
                  rows={2}
                  placeholder="この写真についてのメモ(機材・撮影設定はExifから自動入力されます)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              {/* 機材・撮影設定(Exifから自動入力。チップで要約表示し、開くと手動修正できる) */}
              {(() => {
                const d = currentPhoto.data;
                const fields: { key: "camera" | "lens" | "focalLength" | "fNumber" | "exposureTime" | "iso"; label: string; placeholder: string; wide?: boolean }[] = [
                  { key: "camera", label: "カメラ", placeholder: "例: Sony α7 IV", wide: true },
                  { key: "lens", label: "レンズ", placeholder: "例: FE 24-70mm F2.8 GM II", wide: true },
                  { key: "focalLength", label: "焦点距離", placeholder: "35mm" },
                  { key: "fNumber", label: "F値", placeholder: "2.8" },
                  { key: "exposureTime", label: "シャッター速度", placeholder: "1/500" },
                  { key: "iso", label: "ISO", placeholder: "100" },
                ];
                const chips = [
                  d.camera,
                  d.lens,
                  d.focalLength,
                  d.fNumber && `f/${d.fNumber}`,
                  d.exposureTime && `${d.exposureTime}s`,
                  d.iso && `ISO ${d.iso}`,
                ].filter(Boolean) as string[];
                return (
                  <details className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <summary className="cursor-pointer text-sm font-semibold text-gray-700 list-none flex items-center justify-between">
                      <span>📷 機材・撮影設定{photos.length > 1 ? `(${currentIndex + 1}枚目)` : ""}</span>
                      <span className="text-[10px] font-normal text-gray-400">
                        {currentPhoto.exifChecking ? "解析中..." : chips.length > 0 ? "Exif自動入力・タップで編集" : "タップして入力"}
                      </span>
                    </summary>
                    {chips.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {chips.map((c) => (
                          <span key={c} className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600">
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {fields.map((f) => (
                        <label key={f.key} className={`block ${f.wide ? "col-span-2" : ""}`}>
                          <span className="text-[10px] text-gray-500">{f.label}</span>
                          <input
                            value={d[f.key]}
                            onChange={(e) => updatePhotoData(currentIndex, { [f.key]: e.target.value })}
                            placeholder={f.placeholder}
                            inputMode={f.key === "fNumber" || f.key === "iso" ? "decimal" : undefined}
                            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
                          />
                        </label>
                      ))}
                    </div>
                  </details>
                );
              })()}

              {/* 4. おすすめの理由・構図のコツ(投稿全体で1つ) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 text-white text-[10px] font-bold mr-1.5 align-middle">
                    4
                  </span>
                  おすすめの理由・構図のコツ(任意)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="おすすめの理由・構図のコツなど"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              {/* 5. 周辺情報・アクセス(駐車場・飲食店など。1つの入力欄のみ) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 text-white text-[10px] font-bold mr-1.5 align-middle">
                    5
                  </span>
                  周辺情報・アクセス(任意){photos.length > 1 ? `(${currentIndex + 1}枚目)` : ""}
                </label>
                <ChipRow
                  value={currentPhoto.data.nearbyInfo}
                  chips={NEARBY_INFO_CHIPS}
                  colorClass="bg-orange-500 border-orange-500"
                  onToggle={(chip) =>
                    updatePhotoData(currentIndex, {
                      nearbyInfo: toggleChipInValue(currentPhoto.data.nearbyInfo, chip, NEARBY_INFO_CHIPS),
                    })
                  }
                />
                <textarea
                  value={currentPhoto.data.nearbyInfo}
                  onChange={(e) => updatePhotoData(currentIndex, { nearbyInfo: e.target.value })}
                  rows={2}
                  placeholder="駐車場・飲食店・トイレの有無・徒歩アクセスなど"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
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
