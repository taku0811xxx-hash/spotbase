"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, useMotionValue, useTransform, animate, type PanInfo } from "framer-motion";
import type { PhotoSpot } from "@/lib/types/photoSpot";
import { distanceMeters } from "@/lib/userPathHistory";
import PhotoSpotFilterBar from "@/components/PhotoSpotFilterBar";
import { EMPTY_PHOTO_SPOT_FILTERS, matchesPhotoSpotFilters, type PhotoSpotFilters } from "@/lib/photoSpotFilters";
import LikeSaveButtons from "@/components/LikeSaveButtons";
import { PHOTO_BOTTOM_NAV_SAFE_PADDING_CLASS } from "@/components/PhotoBottomNav";
import { getLicenseBadges, canDownloadFree } from "@/lib/photoSpotLicense";
import { Download } from "lucide-react";

// LeafletはSSR非対応なのでクライアント側のみで読み込む。
// pro向けのcomponents/Map.tsxとは別の、photoSpot専用の軽量な地図コンポーネント。
const PhotoSpotMap = dynamic(() => import("@/components/PhotoSpotMap"), { ssr: false });

// 周辺スポットとみなす距離(m)。SpotBase本体のpinSync統合ロジック(300m)より
// 狭め: ギャラリーの「近くの撮影スポット」は徒歩圏の近接候補を想定しているため。
const NEARBY_RADIUS_METERS = 1500;

// 「商用利用OK」「無料素材」等のライセンスバッジ表示を一時的にオフにする。
// 再表示する可能性があるため、判定ロジック(getLicenseBadges)自体は残し、
// 表示側のみをこのフラグで止める。
const SHOW_LICENSE_BADGES = false;

type PhotoItem = {
  spot: PhotoSpot;
  url: string;
};

type Props = {
  spots: PhotoSpot[];
  loading: boolean;
  // 地図一覧ページのポップアップ「詳細を見る」から遷移してきた場合に、
  // 該当スポットを最初から選択状態(2カラム詳細ビュー)にするためのID
  initialSpotId?: string;
  // 無限スクロール: 一覧下端に到達した際に次ページを取得する(Firestoreの
  // 読み取り件数課金を抑えるため、呼び出し元は初回20件のみ取得している)
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
};

// 写真1件分に紐づく撮影メタデータを、キャプション用の短い文字列配列に整形する。
function buildExifLines(spot: PhotoSpot): string[] {
  const { cameraGear, exif } = spot;
  const lines: string[] = [];
  if (cameraGear?.camera) lines.push(`カメラ: ${cameraGear.camera}`);
  if (cameraGear?.lens) lines.push(`レンズ: ${cameraGear.lens}`);
  const settings = [
    exif?.fNumber != null ? `F${exif.fNumber}` : null,
    exif?.exposureTime ? `SS ${exif.exposureTime}` : null,
    exif?.iso != null ? `ISO ${exif.iso}` : null,
    exif?.focalLength ? exif.focalLength : null,
  ].filter(Boolean);
  if (settings.length > 0) lines.push(`設定: ${settings.join(" / ")}`);
  if (exif?.timeOfDay) lines.push(`撮影時間帯: ${exif.timeOfDay}`);
  return lines;
}

// 画面幅の何%以上ドラッグしたら「戻る」とみなすか
const DISMISS_RATIO = 0.35;
// このドラッグ速度(px/s)以上でリリースした場合は、距離が閾値未満でも「戻る」とみなす
const DISMISS_VELOCITY = 800;

export default function PhotoGalleryView({
  spots,
  loading,
  initialSpotId,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
}: Props) {
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<PhotoItem | null>(null);
  const [filters, setFilters] = useState<PhotoSpotFilters>(EMPTY_PHOTO_SPOT_FILTERS);
  const [viewportWidth, setViewportWidth] = useState(400);

  // 詳細ビューのx方向オフセット。指の動きに合わせてこの値をリアルタイムで更新し、
  // 詳細パネルのtransform(style.x)と、背面(一覧)にかぶせるダークオーバーレイの
  // 不透明度(overlayOpacity)の両方をこの1つの値から連動させる。
  const dragX = useMotionValue(0);
  const overlayOpacity = useTransform(dragX, [0, viewportWidth], [0.28, 0]);
  const prevSelectedRef = useRef<PhotoItem | null>(null);

  useEffect(() => {
    function updateWidth() {
      setViewportWidth(window.innerWidth);
    }
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  // 詳細ビューが新しく開かれた時だけ、画面右外からスライドインさせる。
  // (一覧←→詳細の切り替えのみを対象とし、周辺スポットのタップ等で選択中の写真が
  // 差し替わる場合は即座に切り替える)
  useEffect(() => {
    const wasOpen = prevSelectedRef.current !== null;
    const isOpen = selected !== null;
    if (isOpen && !wasOpen) {
      dragX.jump(viewportWidth);
      animate(dragX, 0, { type: "tween", duration: 0.24, ease: "easeOut" });
    } else if (isOpen && wasOpen) {
      dragX.jump(0);
    }
    prevSelectedRef.current = selected;
  }, [selected, viewportWidth, dragX]);

  // 地図一覧ページから「詳細を見る」で遷移してきた場合、該当スポットを自動選択する
  useEffect(() => {
    if (!initialSpotId || selected) return;
    const spot = spots.find((s) => s.id === initialSpotId);
    const url = spot?.photoUrls?.[0];
    if (spot && url) setSelected({ spot, url });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSpotId, spots]);

  // 一覧下端の番兵要素が画面内に入ったら次ページを読み込む(無限スクロール)
  useEffect(() => {
    if (!onLoadMore || !hasMore) return;
    const target = loadMoreSentinelRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, spots.length]);

  // 絞り込み条件に合うスポットのみを対象にする
  const filteredSpots = useMemo(
    () => spots.filter((spot) => matchesPhotoSpotFilters(spot, filters)),
    [spots, filters]
  );

  // 各スポットが持つ写真ギャラリーを、すべて1枚ずつのギャラリー項目に展開する
  const photoItems = useMemo<PhotoItem[]>(() => {
    const items: PhotoItem[] = [];
    for (const spot of filteredSpots) {
      for (const url of spot.photoUrls ?? []) {
        items.push({ spot, url });
      }
    }
    return items;
  }, [filteredSpots]);

  const nearbyItems = useMemo<PhotoItem[]>(() => {
    if (!selected) return [];
    return photoItems.filter((item) => {
      if (item.url === selected.url) return false;
      return (
        distanceMeters(
          { lat: selected.spot.lat, lng: selected.spot.lng },
          { lat: item.spot.lat, lng: item.spot.lng }
        ) <= NEARBY_RADIUS_METERS
      );
    });
  }, [photoItems, selected]);

  // ドラッグ中: 指の動きにそのまま追従させる(0〜viewportWidthの範囲にクランプ)
  function handlePan(_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    const next = Math.min(Math.max(info.offset.x, 0), viewportWidth);
    dragX.set(next);
  }

  // 指を離した時: 画面幅の35%以上、または勢いよくフリックしていれば「戻る」、
  // そうでなければバネで元の位置(全画面表示)へ戻す。
  function handlePanEnd(_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    const shouldDismiss =
      info.offset.x > viewportWidth * DISMISS_RATIO || info.velocity.x > DISMISS_VELOCITY;
    if (shouldDismiss) {
      dismissDetail();
    } else {
      animate(dragX, 0, { type: "spring", stiffness: 420, damping: 38 });
    }
  }

  // ボタンタップ等、ドラッグ以外からの「戻る」も同じスライドアウト演出で統一する
  function dismissDetail() {
    animate(dragX, viewportWidth, {
      type: "tween",
      duration: 0.22,
      ease: "easeOut",
      onComplete: () => {
        setSelected(null);
        dragX.jump(0);
      },
    });
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
        読み込み中...
      </div>
    );
  }

  if (spots.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
        投稿された写真がまだありません
      </div>
    );
  }

  const exifLines = selected ? buildExifLines(selected.spot) : [];

  return (
    // 一覧ビュー(下敷き)と詳細ビュー(上に重ねるドラッグ可能パネル)を常に同時にマウントし、
    // 詳細を指でドラッグして右へ動かすと、一覧側がその下からリアルタイムに透けて見える
    // (iOSのインタラクティブなpush/pop遷移に近い体感)を実現する。
    <div className="relative flex-1 min-h-0 overflow-hidden">
      {/* 一覧ビュー(常時マウント。詳細ビューが被さっている間はダークオーバーレイで少し暗くする) */}
      <div className={`absolute inset-0 overflow-y-auto p-4 sm:p-6 ${PHOTO_BOTTOM_NAV_SAFE_PADDING_CLASS}`}>
        <div className="mb-4 pb-4 border-b border-gray-200">
          <PhotoSpotFilterBar filters={filters} onChange={setFilters} />
        </div>
        {photoItems.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">
            条件に一致する写真が見つかりませんでした
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {photoItems.map((item, i) => (
              // カード内部にLikeSaveButtonsの<button>を含むため、外枠は<button>ではなく
              // role="button"を持つ<div>にする(HTML仕様上<button>は<button>を子に持てず、
              // これを破ると「In HTML, <button> cannot be a descendant of <button>」という
              // ハイドレーションエラーになる)
              <div
                key={`${item.spot.id}-${i}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(item);
                  }
                }}
                className="relative aspect-square rounded-lg overflow-hidden bg-gray-200 group cursor-pointer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={item.spot.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                />
                {SHOW_LICENSE_BADGES && getLicenseBadges(item.spot).length > 0 && (
                  <div className="absolute top-1.5 left-1.5 flex flex-wrap gap-1">
                    {getLicenseBadges(item.spot).map((badge) => (
                      <span
                        key={badge.label}
                        className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    ))}
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 pt-4 pb-1.5 flex items-end justify-between">
                  <span className="text-white text-xs text-left truncate opacity-0 group-hover:opacity-100 transition-opacity">
                    {item.spot.name}
                  </span>
                  <div className="bg-black/30 rounded-full backdrop-blur-sm">
                    <LikeSaveButtons spotId={item.spot.id} url={item.url} size="sm" stopPropagation />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 無限スクロール用の番兵要素。画面内に入ると次ページを自動取得する */}
        {hasMore && (
          <div ref={loadMoreSentinelRef} className="py-6 text-center text-xs text-gray-400">
            {loadingMore ? "読み込み中..." : ""}
          </div>
        )}
      </div>

      {selected && (
        <>
          {/* 一覧を覆うダークオーバーレイ。詳細パネルが右へドラッグされるほど薄くなる */}
          <motion.div
            className="absolute inset-0 bg-black pointer-events-none"
            style={{ opacity: overlayOpacity }}
          />

          {/* 詳細ビュー(写真選択時): 左(拡大写真+詳細+周辺スポット) / 右(地図) の2カラムビュー。
              style.xをdragXに直接バインドし、指の動きにそのまま追従させる。 */}
          <motion.div
            className="absolute inset-0 bg-gray-100 flex flex-col overflow-y-auto md:overflow-hidden shadow-2xl"
            style={{ x: dragX }}
          >
            {/* 画面左端の細いエッジ領域だけをドラッグ起点にする(パネル全体を
                ドラッグ対象にすると、内部のボタン操作や地図のスクロールと
                ジェスチャーが競合してしまうため)。 */}
            <motion.div
              className="absolute inset-y-0 left-0 w-6 z-20 touch-none"
              onPan={handlePan}
              onPanEnd={handlePanEnd}
            />

            <div className="flex flex-col md:flex-row gap-3 p-3 sm:p-4 md:flex-1 md:min-h-0">
              {/* 左側エリア */}
              <div className="flex flex-col gap-4 md:flex-1 md:w-1/2 md:min-h-0 md:overflow-y-auto">
                <button
                  onClick={dismissDetail}
                  className="self-start text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1"
                >
                  ← 一覧に戻る
                </button>

                {/* 1. メイン写真の拡大表示(画面を少しスクロールするだけで地図・詳細情報が
                    目に入るよう、以前より一回りコンパクトなサイズに調整) */}
                <div className="rounded-xl overflow-hidden bg-black flex-shrink-0 shadow-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selected.url}
                    alt={selected.spot.name}
                    className="w-full max-h-72 object-contain bg-black"
                  />
                </div>

                {/* 2. 撮影詳細情報(場所名はあくまで写真に添える補足情報として控えめに表示) */}
                <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 flex-shrink-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-gray-400">{selected.spot.address}</p>
                      <h2 className="text-sm font-medium text-gray-700">{selected.spot.name}</h2>
                    </div>
                    <LikeSaveButtons spotId={selected.spot.id} url={selected.url} size="md" />
                  </div>

                  {SHOW_LICENSE_BADGES && getLicenseBadges(selected.spot).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {getLicenseBadges(selected.spot).map((badge) => (
                        <span
                          key={badge.label}
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  )}

                  {canDownloadFree(selected.spot) && (
                    <a
                      href={selected.spot.downloadUrl ?? selected.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors rounded-lg px-3 py-1.5"
                    >
                      <Download size={14} strokeWidth={2.5} />
                      無料ダウンロード
                    </a>
                  )}

                  {selected.spot.description && (
                    <p className="text-sm text-gray-500">{selected.spot.description}</p>
                  )}
                  {exifLines.length > 0 && (
                    <ul className="text-xs text-gray-500 space-y-0.5 pt-1 border-t border-gray-100">
                      {exifLines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                  {(selected.spot.subjectTags?.length || selected.spot.equipmentTags?.length) && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {[...(selected.spot.subjectTags ?? []), ...(selected.spot.equipmentTags ?? [])].map(
                        (tag) => (
                          <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                            {tag}
                          </span>
                        )
                      )}
                    </div>
                  )}
                  {selected.spot.accessNote && (
                    <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5 mt-2">
                      撮影アドバイス: {selected.spot.accessNote}
                    </p>
                  )}
                </div>

                {/* 🚗 周辺の駐車場・アクセス */}
                <div className="bg-white rounded-xl border border-gray-200 p-4 flex-shrink-0">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">🚗 周辺の駐車場・アクセス</h3>
                  {selected.spot.parkingLots && selected.spot.parkingLots.length > 0 ? (
                    <ul className="space-y-2">
                      {selected.spot.parkingLots.map((lot, i) => (
                        <li key={`${lot.name}-${i}`} className="border border-gray-100 rounded-lg px-3 py-2 bg-gray-50">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-gray-800">{lot.name}</p>
                            {lot.isCoinParking && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 flex-shrink-0">
                                コインパーキング
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {lot.distance}
                            {lot.capacity && ` ・ ${lot.capacity}`}
                          </p>
                          {lot.note && <p className="text-xs text-amber-700 mt-1">⚠ {lot.note}</p>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-xs text-gray-400 space-y-1">
                      <p>※周辺のコインパーキングをご利用ください</p>
                      <a
                        href={`https://www.google.com/maps/search/駐車場/@${selected.spot.lat},${selected.spot.lng},16z`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-orange-600 hover:text-orange-700 font-medium"
                      >
                        Google Mapsで周辺の駐車場を検索 →
                      </a>
                    </div>
                  )}
                </div>

                {/* 3. 周辺の撮影スポット・写真 */}
                <div className="flex-shrink-0">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">周辺の撮影スポット</h3>
                  {nearbyItems.length === 0 ? (
                    <p className="text-xs text-gray-400">周辺に他の撮影スポットは見つかりませんでした</p>
                  ) : (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {nearbyItems.map((item, i) => (
                        <button
                          key={`${item.spot.id}-nearby-${i}`}
                          onClick={() => setSelected(item)}
                          className="relative flex-shrink-0 w-28 h-28 rounded-lg overflow-hidden bg-gray-200"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.url} alt={item.spot.name} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 右側エリア: 選択した写真の撮影場所にフォーカスした地図。
                  モバイルではコンパクトな固定高さ、md+では左カラムと同じ高さまで広げる。 */}
              <div className="w-full h-64 md:flex-1 md:w-1/2 md:h-auto rounded-xl overflow-hidden border border-gray-200 flex-shrink-0">
                <PhotoSpotMap spot={selected.spot} />
              </div>
            </div>

            {/* 画面最下部の「一覧に戻る」ボタン。スクロール末尾に常に表示される */}
            <div className={`flex-shrink-0 px-3 sm:px-4 pb-3 sm:pb-4 ${PHOTO_BOTTOM_NAV_SAFE_PADDING_CLASS}`}>
              <button
                onClick={dismissDetail}
                className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                一覧に戻る
              </button>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
