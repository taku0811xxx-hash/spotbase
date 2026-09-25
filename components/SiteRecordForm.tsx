"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  FIELD_NOTE_COMM_PRESETS,
  FIELD_NOTE_ENVIRONMENT_PRESETS,
  FIELD_NOTE_LOGISTICS_PRESETS,
  FIELD_NOTE_TAG_OPTIONS,
  type FieldNoteCategory,
  type FieldNoteCustomField,
} from "@/lib/fieldNotes";
import { geocodeQuery, reverseGeocode, type GeocodeResult } from "@/lib/geocode";

// LeafletはSSR非対応なのでクライアント側のみで読み込む
const LocationPicker = dynamic(() => import("./LocationPicker"), {
  ssr: false,
});

export type SiteRecordSubmitInput = {
  name: string;
  referenceId?: string;
  address?: string;
  addressNote?: string;
  lat: number;
  lng: number;
  category: FieldNoteCategory;
  tags: string[];
  comment: string;
  contactInfo?: string;
  privateNote?: string;
  imageFiles: File[];
  drawingFiles: File[];
  customFields: FieldNoteCustomField[];
};

interface Props {
  submitting: boolean;
  error?: string;
  onSubmit: (input: SiteRecordSubmitInput) => void;
  onClose: () => void;
}

// 固定タブ。「＋ 追加項目」で動的に増えるタブは含まない
// (動的タブの選択状態は `field:${key}` という文字列で表す。詳細は下のsection参照)。
type Section =
  | "address"
  | "public"
  | "logistics"
  | "comm"
  | "environment"
  | "drawings"
  | "contact";
type LocationMode = "auto" | "address" | "latlng" | "pin";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "address", label: "住所 & 写真" },
  { id: "public", label: "基本情報・注意事項" },
  { id: "logistics", label: "搬入・駐車場・アクセス" },
  { id: "comm", label: "通信・電波状況" },
  { id: "environment", label: "周辺環境" },
  { id: "drawings", label: "図面管理" },
  { id: "contact", label: "連絡先 & 非公開メモ" },
];

// ユーザーが自由なタイトルで追加した項目(動的タブ)の選択状態を表す接頭辞。
// 項目名(key)をそのままタブのidとして使う(項目名は追加時に重複禁止にしている)。
const DYNAMIC_FIELD_PREFIX = "field:";

const LOCATION_MODES: { id: LocationMode; label: string }[] = [
  { id: "auto", label: "AUTO" },
  { id: "address", label: "住所検索" },
  { id: "latlng", label: "緯度経度" },
  { id: "pin", label: "マップで指定" },
];

const DRAFT_STORAGE_KEY = "spotbase.siteRecordDraft";

// 「場所タイプ/カテゴリ」選択UIは廃止し、現場(ロケ地)単位で画角・搬入駐車場・
// 許可・注意事項などを網羅的に記録するデータモデルに統一したため、
// field_notesドキュメントのcategoryは常にこの固定値で保存する。
// (地図上のピンアイコンの色分け等、category自体は下位互換のため引き続き
// スキーマ上に残している)
const SITE_RECORD_CATEGORY: FieldNoteCategory = "location";

type DraftShape = {
  name: string;
  referenceId: string;
  addressQuery: string;
  addressNote: string;
  lat: number | null;
  lng: number | null;
  tags: string[];
  comment: string;
  contactInfo: string;
  privateNote: string;
  customFields: FieldNoteCustomField[];
};

// 管理ID(参照番号)を自動採番する。「LOC-年度-4桁」の形式で、4桁部分は
// 採番タイミングのタイムスタンプ由来のため実質的に重複しない
// (真の連番にはFirestore側でのカウンタ管理が必要になるが、社内の識別子として
// 使う用途では過剰なため、ここでは軽量なタイムスタンプ方式を採用している)。
function generateReferenceId(): string {
  const year = new Date().getFullYear();
  const seq = String(Date.now() % 10000).padStart(4, "0");
  return `LOC-${year}-${seq}`;
}

// 開いた時点で保存済みの下書きがあれば読み込む(写真ファイルはlocalStorageに
// シリアライズできないため対象外)。useStateの遅延初期化子から呼ぶことで、
// エフェクト内でのsetState連鎖を避ける。
function loadDraft(): Partial<DraftShape> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<DraftShape>;
  } catch (err) {
    console.warn("[SiteRecordForm] 下書きの復元に失敗しました:", err);
    return {};
  }
}

// SuperScout風の「現場記録」新規作成モーダル。
// 上部にヘッダーアクション(閉じる/保存)、左に固定セクション+ユーザーが自由に
// 増やせる動的タブのナビゲーション、中央に各セクションの入力カード、
// 下部にキャンセル/下書き保存を配置する。
export default function SiteRecordForm({ submitting, error, onSubmit, onClose }: Props) {
  const [draft] = useState<Partial<DraftShape>>(loadDraft);

  // 固定タブのid、または動的タブを表す `field:${項目名}` のいずれかを持つ
  const [section, setSection] = useState<string>("address");
  const [locationMode, setLocationMode] = useState<LocationMode>("address");

  const [name, setName] = useState(draft.name ?? "");
  // 管理ID/参照番号は手入力させず、フォームを開いたタイミングで自動採番する
  // (下書き復元時は、前回すでに発行済みのIDをそのまま引き継ぐ)。
  const [referenceId] = useState(draft.referenceId ?? generateReferenceId);

  const [addressQuery, setAddressQuery] = useState(draft.addressQuery ?? "");
  const [addressNote, setAddressNote] = useState(draft.addressNote ?? "");
  const [addressResults, setAddressResults] = useState<GeocodeResult[]>([]);
  const [addressSearching, setAddressSearching] = useState(false);
  const [autoLocating, setAutoLocating] = useState(false);
  const [locationError, setLocationError] = useState("");

  const hasDraftLocation = typeof draft.lat === "number" && typeof draft.lng === "number";
  const [lat, setLat] = useState<number | null>(hasDraftLocation ? draft.lat! : null);
  const [lng, setLng] = useState<number | null>(hasDraftLocation ? draft.lng! : null);
  const [latInput, setLatInput] = useState(hasDraftLocation ? String(draft.lat) : "");
  const [lngInput, setLngInput] = useState(hasDraftLocation ? String(draft.lng) : "");
  // 逆ジオコーディング等でこちらがaddressQueryを書き換えた直後は、
  // 下のデバウンス自動検索(住所→座標)を1回だけスキップする。
  // (座標→住所→座標→…という無限ループを避けるためのガード)
  const suppressNextAutoSearchRef = useRef(false);

  const [contactInfo, setContactInfo] = useState(draft.contactInfo ?? "");
  const [privateNote, setPrivateNote] = useState(draft.privateNote ?? "");

  const [selectedTags, setSelectedTags] = useState<string[]>(draft.tags ?? []);
  const [comment, setComment] = useState(draft.comment ?? "");
  // ユーザーが自由に追加するカスタム項目(項目名・内容のセット)。
  // 「搬入・駐車場・アクセス」「通信・周辺環境」タブのプリセット項目も、
  // 「＋独自項目」タブの自由記述項目も、すべて同じこの配列で管理する
  // (タブ側では表示時に項目名でグルーピング/絞り込みしているだけ)。
  // 下書きがなければ、プリセット項目を空欄の状態で最初から用意しておく
  // (「最初からデフォルトの入力欄を用意しつつ、不要なら削除できる」仕様)。
  const [customFields, setCustomFields] = useState<FieldNoteCustomField[]>(
    () =>
      draft.customFields ??
      [
        ...FIELD_NOTE_LOGISTICS_PRESETS,
        ...FIELD_NOTE_COMM_PRESETS,
        ...FIELD_NOTE_ENVIRONMENT_PRESETS,
      ].map((key) => ({
        key,
        value: "",
      }))
  );

  // 左メニュー下部の「＋ 項目を追加」の入力中状態(タイトルを入力している間だけtrue)
  const [addingField, setAddingField] = useState(false);
  const [newFieldTitle, setNewFieldTitle] = useState("");

  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 図面(配置図・見取り図等、PDF/画像)。新規作成フォームのため、ここでは
  // 「これから送信する図面ファイル」のみを保持する(アップロード自体は送信時)。
  const [drawingFiles, setDrawingFiles] = useState<File[]>([]);
  const [drawingDragOver, setDrawingDragOver] = useState(false);
  const drawingInputRef = useRef<HTMLInputElement>(null);

  function addDrawingFiles(files: FileList | File[]) {
    setDrawingFiles((prev) => [...prev, ...Array.from(files)]);
  }

  function removeDrawingFile(index: number) {
    setDrawingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);

  // アンマウント時に最新のプレビューURLを確実に解放できるよう、refで参照を保持する。
  const imagePreviewsRef = useRef(imagePreviews);
  useEffect(() => {
    imagePreviewsRef.current = imagePreviews;
  }, [imagePreviews]);
  useEffect(() => {
    return () => {
      imagePreviewsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // 「住所を入力」または「現場名/ロケ地名」欄への入力から、デバウンス(700ms)を
  // かけてジオコーディングを自動実行し、ミニマップのピンを自動設置する。
  // 住所欄が入力されていればそちらを優先し、空の場合のみ現場名で検索する。
  useEffect(() => {
    if (suppressNextAutoSearchRef.current) {
      suppressNextAutoSearchRef.current = false;
      return;
    }
    const q = addressQuery.trim() || name.trim();
    if (!q) return;

    const timer = setTimeout(async () => {
      setAddressSearching(true);
      setLocationError("");
      try {
        const results = await geocodeQuery(q);
        setAddressResults(results);
        if (results.length > 0) {
          const top = results[0];
          setLat(top.lat);
          setLng(top.lng);
          setLatInput(String(top.lat));
          setLngInput(String(top.lng));
        }
      } finally {
        setAddressSearching(false);
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [addressQuery, name]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  // プリセットのカスタム項目名をワンタップで追加する。同名の項目が既にあれば
  // 重複追加せず、空行の追加のみに留める。
  function addCustomFieldPreset(presetKey: string) {
    setCustomFields((prev) => {
      if (prev.some((f) => f.key === presetKey)) return prev;
      return [...prev, { key: presetKey, value: "" }];
    });
  }

  function updateCustomFieldValue(index: number, value: string) {
    setCustomFields((prev) => prev.map((f, i) => (i === index ? { ...f, value } : f)));
  }

  function removeCustomField(index: number) {
    setCustomFields((prev) => prev.filter((_, i) => i !== index));
  }

  // 左メニュー下部「＋ 項目を追加」: 入力されたタイトルを新しい動的タブとして追加し、
  // そのタブへ自動的に切り替える。同名の項目(プリセット含む)が既にある場合は
  // 重複追加せず、既存のタブへ切り替えるだけにする。
  function addCustomFieldWithTitle(title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    setCustomFields((prev) =>
      prev.some((f) => f.key === trimmed) ? prev : [...prev, { key: trimmed, value: "" }]
    );
    setSection(`${DYNAMIC_FIELD_PREFIX}${trimmed}`);
  }

  function updateCustomFieldValueByKey(key: string, value: string) {
    setCustomFields((prev) => prev.map((f) => (f.key === key ? { ...f, value } : f)));
  }

  // 動的タブ(左メニュー上のゴミ箱アイコン、または詳細エリア上の削除ボタン)から呼ばれる。
  // 削除対象を表示中だった場合は、住所タブへ戻す。
  function removeCustomFieldByKey(key: string) {
    setCustomFields((prev) => prev.filter((f) => f.key !== key));
    setSection((prev) => (prev === `${DYNAMIC_FIELD_PREFIX}${key}` ? "address" : prev));
  }

  // 「＋追加項目」タブに表示する項目 = customFieldsのうち、プリセット
  // (搬入・駐車場・アクセス/通信/周辺環境)のキーに該当しないもの。
  const PRESET_KEYS = [
    ...FIELD_NOTE_LOGISTICS_PRESETS,
    ...FIELD_NOTE_COMM_PRESETS,
    ...FIELD_NOTE_ENVIRONMENT_PRESETS,
  ];
  const freeformCustomFields = customFields
    .map((f, index) => ({ ...f, index }))
    .filter((f) => !PRESET_KEYS.includes(f.key));

  // 「搬入・駐車場・アクセス」「通信」「周辺環境」タブの共通レイアウト。
  // プリセット項目は項目名を固定ラベルとして表示し、内容(value)だけ編集できる。
  // 現在追加されていないプリセットは、チップから再追加できるようにする。
  function renderPresetFieldsCard({
    title,
    hint,
    presetKeys,
  }: {
    title: string;
    hint: string;
    presetKeys: string[];
  }) {
    const activeFields = customFields
      .map((f, index) => ({ ...f, index }))
      .filter((f) => presetKeys.includes(f.key));
    const availableToAdd = presetKeys.filter(
      (key) => !customFields.some((f) => f.key === key)
    );
    return (
      <div className="rounded-xl border border-slate-200 p-4 sm:p-6 space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</p>
          <p className="text-[11px] text-slate-400">{hint}</p>
        </div>

        {activeFields.length > 0 && (
          <div className="space-y-3">
            {activeFields.map((field) => (
              <div key={field.key} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-slate-600">{field.key}</label>
                  <button
                    type="button"
                    onClick={() => removeCustomField(field.index)}
                    className="text-[11px] text-slate-400 hover:text-red-600 transition-colors flex-shrink-0"
                  >
                    🗑 非表示にする
                  </button>
                </div>
                <textarea
                  value={field.value}
                  onChange={(e) => updateCustomFieldValue(field.index, e.target.value)}
                  rows={2}
                  placeholder="内容を入力"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            ))}
          </div>
        )}

        {availableToAdd.length > 0 && (
          <div className="space-y-1.5">
            {activeFields.length > 0 && (
              <p className="text-[11px] text-slate-400">他の項目を追加:</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {availableToAdd.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => addCustomFieldPreset(preset)}
                  className="text-[11px] sm:text-xs font-medium rounded-full border px-2.5 py-1 bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100 transition-colors"
                >
                  + {preset}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files);
    setImageFiles((prev) => [...prev, ...newFiles]);
    setImagePreviews((prev) => [...prev, ...newFiles.map((f) => URL.createObjectURL(f))]);
  }

  function removeImage(index: number) {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleAutoLocate() {
    setLocationError("");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationError("この端末では位置情報を取得できません");
      return;
    }
    setAutoLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        setLat(newLat);
        setLng(newLng);
        setLatInput(String(newLat));
        setLngInput(String(newLng));
        try {
          const address = await reverseGeocode(newLat, newLng);
          if (address) {
            suppressNextAutoSearchRef.current = true;
            setAddressQuery(address);
          }
        } catch (err) {
          console.warn("[SiteRecordForm] 逆ジオコーディングに失敗:", err);
        }
        setAutoLocating(false);
      },
      () => {
        setLocationError("位置情報を取得できませんでした。権限設定をご確認ください。");
        setAutoLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function handleAddressSearch() {
    if (!addressQuery.trim()) return;
    setAddressSearching(true);
    setLocationError("");
    try {
      const results = await geocodeQuery(addressQuery);
      setAddressResults(results);
      if (results.length === 0) {
        setLocationError("該当する住所が見つかりませんでした");
      }
    } finally {
      setAddressSearching(false);
    }
  }

  function selectAddressResult(result: GeocodeResult) {
    setLat(result.lat);
    setLng(result.lng);
    setLatInput(String(result.lat));
    setLngInput(String(result.lng));
    suppressNextAutoSearchRef.current = true;
    setAddressQuery(result.displayName);
    setAddressResults([]);
  }

  function handleLatLngApply() {
    const parsedLat = Number(latInput);
    const parsedLng = Number(lngInput);
    if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
      setLocationError("緯度・経度は数値で入力してください");
      return;
    }
    setLocationError("");
    setLat(parsedLat);
    setLng(parsedLng);
  }

  // ミニマップ上のピンをクリック/ドラッグで動かした時の処理。
  // 緯度経度を反映したうえで、逆ジオコーディングして住所欄にも反映する
  // (座標→住所の一方向。ここで得た住所文字列が再度デバウンス検索を
  // 発火させて元の座標を上書きしないよう、suppressフラグを立てておく)。
  async function handlePinChange(pos: { lat: number; lng: number }) {
    setLat(pos.lat);
    setLng(pos.lng);
    setLatInput(String(pos.lat));
    setLngInput(String(pos.lng));
    try {
      const address = await reverseGeocode(pos.lat, pos.lng);
      if (address) {
        suppressNextAutoSearchRef.current = true;
        setAddressQuery(address);
      }
    } catch (err) {
      console.warn("[SiteRecordForm] 逆ジオコーディングに失敗:", err);
    }
  }

  function buildDraft(): DraftShape {
    return {
      name,
      referenceId,
      addressQuery,
      addressNote,
      lat,
      lng,
      tags: selectedTags,
      comment,
      contactInfo,
      privateNote,
      customFields,
    };
  }

  function handleSaveDraft() {
    try {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(buildDraft()));
      setDraftSavedAt(Date.now());
    } catch (err) {
      console.warn("[SiteRecordForm] 下書きの保存に失敗しました:", err);
    }
  }

  function handleSubmit() {
    if (!name.trim()) {
      setSection("address");
      setLocationError("現場名を入力してください");
      return;
    }
    if (lat === null || lng === null) {
      setSection("address");
      setLocationError("位置情報を指定してください(AUTO/住所検索/緯度経度/マップのいずれか)");
      return;
    }
    onSubmit({
      name: name.trim(),
      referenceId: referenceId.trim() || undefined,
      address: addressQuery.trim() || undefined,
      addressNote: addressNote.trim() || undefined,
      lat,
      lng,
      // カテゴリ選択UIは廃止したため、常に固定値("location")を送信する
      // (現場単位で情報を網羅的に記録するデータモデルへの統一)。
      category: SITE_RECORD_CATEGORY,
      tags: selectedTags,
      comment: comment.trim(),
      contactInfo: contactInfo.trim() || undefined,
      privateNote: privateNote.trim() || undefined,
      imageFiles,
      drawingFiles,
      // 項目名または内容が空のままの行(プリセットの未入力分含む)は保存対象から除外する
      customFields: customFields
        .map((f) => ({ key: f.key.trim(), value: f.value.trim() }))
        .filter((f) => f.key.length > 0 && f.value.length > 0),
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-[9998] bg-black/50" onClick={onClose} />
      {/* 画面の大部分を広く使えるよう、PCでは90vw×85vh・max-w-7xl相当まで拡大する。
          モバイルは引き続き画面いっぱい(余白なし)で表示する。 */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-0 sm:p-6 pointer-events-none">
        <div
          className="bg-white rounded-none sm:rounded-2xl shadow-2xl w-full h-full sm:w-[90vw] sm:h-[85vh] sm:max-w-7xl flex flex-col overflow-hidden pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ヘッダーアクション */}
          <div className="flex items-center justify-between gap-2 px-5 sm:px-10 py-3 sm:py-4 border-b border-slate-200 flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="font-semibold text-slate-900 text-base sm:text-lg truncate">
                現場記録を作成
              </h2>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* 自動採番された管理ID/参照番号。入力項目としては廃止し、
                  控えめなバッジとして表示のみ行う(保存データには含まれる)。 */}
              <span
                title="自動採番された管理ID(変更できません)"
                className="hidden sm:inline-block text-[11px] font-medium text-slate-400 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1 whitespace-nowrap"
              >
                ID: {referenceId}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="text-sm font-medium text-slate-500 hover:text-slate-700 rounded-lg px-3 py-1.5 hover:bg-slate-100 transition-colors"
              >
                閉じる
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="text-sm font-semibold text-white bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-4 py-1.5 transition-colors"
              >
                {submitting ? "保存中..." : "保存"}
              </button>
            </div>
          </div>

          <div className="flex flex-1 min-h-0">
            {/* 左側ナビゲーション。モーダル拡大に合わせて幅も広めに確保する。
                固定タブ + ユーザーが追加した動的タブ(項目名)を並べ、最下部に
                「＋ 項目を追加」の入力UIを常に表示する。 */}
            <div className="w-36 sm:w-56 flex-shrink-0 border-r border-slate-200 bg-slate-50 py-4 px-2.5 flex flex-col overflow-y-auto">
              <div className="space-y-1.5">
                {SECTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSection(s.id)}
                    className={`w-full text-left text-[11px] sm:text-sm font-medium rounded-lg px-3 py-2.5 transition-colors ${
                      section === s.id
                        ? "bg-indigo-700 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {freeformCustomFields.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-200 space-y-1">
                  {freeformCustomFields.map((f) => {
                    const tabId = `${DYNAMIC_FIELD_PREFIX}${f.key}`;
                    return (
                      <div key={f.key} className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setSection(tabId)}
                          title={f.key}
                          className={`flex-1 min-w-0 text-left text-[11px] sm:text-sm font-medium rounded-lg px-3 py-2.5 truncate transition-colors ${
                            section === tabId
                              ? "bg-indigo-700 text-white"
                              : "text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {f.key}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeCustomFieldByKey(f.key)}
                          title="この項目を削除"
                          aria-label="この項目を削除"
                          className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                            section === tabId
                              ? "text-indigo-100 hover:text-white hover:bg-indigo-800"
                              : "text-slate-400 hover:text-red-600 hover:bg-red-50"
                          }`}
                        >
                          🗑
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 「＋ 項目を追加」: クリックでタイトル入力欄を開き、Enter/ボタンで
                  新しい動的タブとして追加する(プリセットチップ同様、追加=左メニューに
                  新しいタブが増える、という挙動に統一)。 */}
              <div className="mt-2 pt-2 border-t border-slate-200">
                {addingField ? (
                  <div className="space-y-1.5">
                    <input
                      autoFocus
                      type="text"
                      value={newFieldTitle}
                      onChange={(e) => setNewFieldTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          addCustomFieldWithTitle(newFieldTitle);
                          setNewFieldTitle("");
                          setAddingField(false);
                        } else if (e.key === "Escape") {
                          setNewFieldTitle("");
                          setAddingField(false);
                        }
                      }}
                      placeholder="項目名(例: ドローン飛行許可)"
                      className="w-full rounded-lg border border-indigo-200 px-2.5 py-2 text-[11px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          addCustomFieldWithTitle(newFieldTitle);
                          setNewFieldTitle("");
                          setAddingField(false);
                        }}
                        className="flex-1 text-[11px] sm:text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg px-2 py-1.5 transition-colors"
                      >
                        追加
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewFieldTitle("");
                          setAddingField(false);
                        }}
                        className="text-[11px] sm:text-xs font-medium text-slate-500 hover:bg-slate-100 rounded-lg px-2 py-1.5 transition-colors"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingField(true)}
                    className="w-full text-left text-[11px] sm:text-sm font-medium text-indigo-700 border border-dashed border-indigo-200 hover:bg-indigo-50 rounded-lg px-3 py-2.5 transition-colors"
                  >
                    ＋ 項目を追加
                  </button>
                )}
              </div>
            </div>

            {/* メインフォームエリア。モーダル拡大に合わせて余白・最大幅を広げ、
                カード内の要素同士の間隔もゆったり取る。 */}
            <div className="flex-1 min-w-0 overflow-y-auto px-5 sm:px-10 py-5 sm:py-8">
              <div className="max-w-5xl mx-auto space-y-5 sm:space-y-6">
              {section === "address" && (
                <>
                  {/* 写真・ファイル共有ブロック */}
                  <div className="rounded-xl border border-slate-200 p-4 sm:p-6 space-y-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      写真・ファイル
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full rounded-lg border-2 border-dashed border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-700 text-sm sm:text-base font-medium py-10 sm:py-14 transition-colors"
                    >
                      写真・ファイルをアップロード
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        handleFilesSelected(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{imageFiles.length} 枚の写真</span>
                    </div>
                    {imagePreviews.length > 0 && (
                      <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                        {imagePreviews.map((url, i) => (
                          <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => removeImage(i)}
                              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              aria-label="削除"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 基本入力カード。管理ID/参照番号は入力項目としては廃止し、
                      ヘッダー右上に自動採番されたIDをバッジ表示するのみにしている
                      (下のhandleSubmit内で内部的にはそのままsubmitに含めている)。 */}
                  <div className="rounded-xl border border-slate-200 p-4 sm:p-6 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600">現場名 / ロケ地名</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="例: 〇〇公園 南口広場"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  {/* 位置・住所入力カード */}
                  <div className="rounded-xl border border-slate-200 p-4 sm:p-6 space-y-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">位置</p>
                    <div className="flex flex-wrap gap-1.5">
                      {LOCATION_MODES.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setLocationMode(m.id)}
                          className={`text-[11px] sm:text-xs font-medium rounded-md border px-3 py-1.5 transition-colors ${
                            locationMode === m.id
                              ? "bg-slate-800 text-white border-slate-800"
                              : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    {/* ADDRESS/PINタブでは、入力欄とミニマップを左右に並べて表示する。
                        住所/現場名の入力(デバウンス自動検索)やピンのドラッグが、
                        すぐ横のミニマップに反映される様子が見えるようにするため。
                        モーダル拡大に合わせ、ミニマップ側にやや広めの列幅(3:2)を割り当てる。 */}
                    <div
                      className={
                        locationMode === "address" || locationMode === "pin"
                          ? "grid sm:grid-cols-5 gap-5 items-start"
                          : ""
                      }
                    >
                      <div className="space-y-2 min-w-0 sm:col-span-2">
                        {locationMode === "auto" && (
                          <button
                            type="button"
                            onClick={handleAutoLocate}
                            disabled={autoLocating}
                            className="text-sm font-medium text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 rounded-lg px-3 py-2 transition-colors"
                          >
                            {autoLocating ? "取得中..." : "現在地を自動取得"}
                          </button>
                        )}

                        {locationMode === "address" && (
                          <>
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                value={addressQuery}
                                onChange={(e) => setAddressQuery(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleAddressSearch()}
                                placeholder="住所を入力"
                                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                              <button
                                type="button"
                                onClick={handleAddressSearch}
                                disabled={addressSearching}
                                className="text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 disabled:opacity-50 rounded-lg px-3 py-2 transition-colors flex-shrink-0"
                              >
                                {addressSearching ? "検索中..." : "検索"}
                              </button>
                            </div>
                            <p className="text-[10px] text-slate-400">
                              入力を止めて少し待つと自動で検索し、右のミニマップにピンが立ちます
                            </p>
                            {addressResults.length > 0 && (
                              <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                                {addressResults.map((r, i) => (
                                  <button
                                    key={`${r.lat}-${r.lng}-${i}`}
                                    type="button"
                                    onClick={() => selectAddressResult(r)}
                                    className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                                  >
                                    {r.displayName}
                                  </button>
                                ))}
                              </div>
                            )}
                            <input
                              type="text"
                              value={addressNote}
                              onChange={(e) => setAddressNote(e.target.value)}
                              placeholder="補足住所・アクセス方法(任意)"
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </>
                        )}

                        {locationMode === "latlng" && (
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={latInput}
                              onChange={(e) => setLatInput(e.target.value)}
                              placeholder="緯度"
                              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <input
                              type="text"
                              value={lngInput}
                              onChange={(e) => setLngInput(e.target.value)}
                              placeholder="経度"
                              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <button
                              type="button"
                              onClick={handleLatLngApply}
                              className="text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-3 py-2 transition-colors flex-shrink-0"
                            >
                              反映
                            </button>
                          </div>
                        )}

                        {locationMode === "pin" && (
                          <p className="text-[11px] text-slate-400">
                            右のミニマップをクリック、またはピンをドラッグして位置を指定してください
                          </p>
                        )}

                        {locationError && <p className="text-xs text-red-600">{locationError}</p>}

                        {lat !== null && lng !== null && (
                          <p className="text-[11px] text-slate-400">
                            選択中の位置: {lat.toFixed(5)}, {lng.toFixed(5)}
                          </p>
                        )}
                      </div>

                      {(locationMode === "address" || locationMode === "pin") && (
                        <div className="space-y-1 sm:col-span-3">
                          <LocationPicker
                            value={lat !== null && lng !== null ? { lat, lng } : null}
                            onChange={handlePinChange}
                            heightClassName="h-64 sm:h-80"
                          />
                          <p className="text-[10px] text-slate-400">
                            ピンをドラッグすると位置と住所欄が自動で更新されます
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {section === "contact" && (
                <div className="rounded-xl border border-slate-200 p-4 sm:p-6 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">許諾先・担当者メモ</label>
                    <input
                      type="text"
                      value={contactInfo}
                      onChange={(e) => setContactInfo(e.target.value)}
                      placeholder="例: 施設管理事務所 03-xxxx-xxxx、要事前申請"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">
                      非公開メモ(社内共有のみを想定)
                    </label>
                    <textarea
                      value={privateNote}
                      onChange={(e) => setPrivateNote(e.target.value)}
                      rows={9}
                      placeholder="例: 交渉時の注意点、過去の対応履歴など"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}

              {/* 「場所タイプ/カテゴリ」選択は廃止した:
                  現場(ロケ地)単位で画角・搬入駐車場・許可・注意事項などをすべて
                  網羅的に記録するデータモデルに統一したため、投稿をカテゴリで
                  分類する必要がなくなったことによる。保存時のcategoryは
                  内部的に固定値("location")として扱う。 */}
              {section === "public" && (
                <div className="rounded-xl border border-slate-200 p-4 sm:p-6 space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">タグ(任意)</label>
                    <div className="flex flex-wrap gap-1.5">
                      {FIELD_NOTE_TAG_OPTIONS.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={`text-[11px] sm:text-xs rounded-full border px-2.5 py-1 font-medium transition-colors ${
                            selectedTags.includes(tag)
                              ? "bg-slate-700 text-white border-slate-700"
                              : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">
                      コメント・注意事項(公開)
                    </label>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={7}
                      placeholder="例: ロケバス2台まで駐車可、屋根なし。夜間の騒音注意。"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}

              {section === "logistics" &&
                renderPresetFieldsCard({
                  title: "搬入・駐車場・アクセス",
                  hint: "駐車場の台数・高さ制限、ロケバス/中継車の可否、搬入経路などを記録できます",
                  presetKeys: FIELD_NOTE_LOGISTICS_PRESETS,
                })}

              {section === "comm" &&
                renderPresetFieldsCard({
                  title: "通信",
                  hint: "電波状況(キャリア別5G/4G)、Wi-Fiの有無などを記録できます",
                  presetKeys: FIELD_NOTE_COMM_PRESETS,
                })}

              {section === "environment" &&
                renderPresetFieldsCard({
                  title: "周辺環境",
                  hint: "周辺の宿泊施設、コンビニ、コインランドリー、ドラッグストア等を記録できます",
                  presetKeys: FIELD_NOTE_ENVIRONMENT_PRESETS,
                })}

              {section === "drawings" && (
                <div className="rounded-xl border border-slate-200 p-4 sm:p-6 space-y-4">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      図面管理
                    </p>
                    <p className="text-[11px] text-slate-400">
                      配置図・見取り図等(PDF/画像)をアップロードできます。保存時にアップロードされ、以降は履歴として残ります
                    </p>
                  </div>

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDrawingDragOver(true);
                    }}
                    onDragLeave={() => setDrawingDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDrawingDragOver(false);
                      if (e.dataTransfer.files.length > 0)
                        addDrawingFiles(e.dataTransfer.files);
                    }}
                    onClick={() => drawingInputRef.current?.click()}
                    className={`rounded-lg border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors ${
                      drawingDragOver
                        ? "border-indigo-400 bg-indigo-50"
                        : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      ref={drawingInputRef}
                      type="file"
                      accept="application/pdf,image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) addDrawingFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <p className="text-sm text-slate-600">
                      図面ファイル(PDF / 画像)をドラッグ&ドロップ、またはクリックして選択
                    </p>
                  </div>

                  {drawingFiles.length > 0 && (
                    <ul className="space-y-1.5">
                      {drawingFiles.map((file, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between gap-2 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
                        >
                          <span className="truncate">
                            {i === drawingFiles.length - 1
                              ? `${file.name}(保存後、最新図面になります)`
                              : file.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeDrawingFile(i)}
                            className="text-slate-400 hover:text-red-600 flex-shrink-0"
                          >
                            削除
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* ユーザーが左メニュー下部の「＋ 項目を追加」で作った動的タブの詳細入力エリア。
                  項目名は追加時に確定済みのため、ここでは内容(value)のみを編集する。 */}
              {section.startsWith(DYNAMIC_FIELD_PREFIX) &&
                (() => {
                  const key = section.slice(DYNAMIC_FIELD_PREFIX.length);
                  const field = customFields.find((f) => f.key === key);
                  if (!field) return null;
                  return (
                    <div className="rounded-xl border border-slate-200 p-4 sm:p-6 space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          {field.key}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeCustomFieldByKey(field.key)}
                          className="text-[11px] text-slate-400 hover:text-red-600 transition-colors flex-shrink-0"
                        >
                          🗑 この項目を削除
                        </button>
                      </div>
                      <textarea
                        value={field.value}
                        onChange={(e) => updateCustomFieldValueByKey(field.key, e.target.value)}
                        rows={10}
                        placeholder="内容を入力"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  );
                })()}

              {error && <p className="text-sm text-red-600">{error}</p>}
              </div>
            </div>
          </div>

          {/* 最下部アクション */}
          <div className="flex items-center justify-between gap-2 px-5 sm:px-10 py-3 sm:py-4 border-t border-slate-200 flex-shrink-0 bg-slate-50">
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-medium text-slate-600 hover:text-slate-800 rounded-lg px-3 py-1.5 hover:bg-slate-100 transition-colors"
            >
              キャンセル
            </button>
            <div className="flex items-center gap-2">
              {draftSavedAt && (
                <span className="text-[11px] text-slate-400">下書きを保存しました</span>
              )}
              <button
                type="button"
                onClick={handleSaveDraft}
                className="text-sm font-medium text-indigo-700 border border-indigo-200 bg-white hover:bg-indigo-50 rounded-lg px-3 py-1.5 transition-colors"
              >
                下書き保存
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
