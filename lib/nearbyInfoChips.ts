// 「ここトレ！」周辺情報欄(駐車場・飲食店・撮影環境等)で共通して使う、
// プリセットチップ+1行の自由記述テキストを1つの文字列として合成/分解する
// ユーティリティ。PhotoUploadModal(投稿時)とPhotoNearbyInfoSheet(投稿後の
// あとから追記)の両方から使う。
// 保存形式の例: "無料Pあり・大型可 / 公園東側のタイムズが一番使いやすい"

export const PARKING_INFO_CHIPS = ["無料Pあり", "有料コインP", "近隣Pなし", "大型可"] as const;
export const DINING_INFO_CHIPS = ["カフェあり", "テイクアウト", "コンビニ近隣"] as const;
export const SHOOTING_ENV_CHIPS = ["三脚OK", "三脚禁止", "トイレあり", "要徒歩10分以上"] as const;

export function splitChipsAndText(
  value: string | undefined,
  chips: readonly string[]
): { selected: string[]; text: string } {
  if (!value) return { selected: [], text: "" };
  const parts = value.split(" / ");
  const chipPart = parts[0] ?? "";
  const rest = parts.slice(1).join(" / ");
  const selected = chips.filter((c) => chipPart.split("・").includes(c));
  // チップ部分が丸ごとプリセットの組み合わせで説明できない場合は、全体を
  // 補足テキストとして扱う(パターンに合わない既存データを消さないための保険)。
  const chipPartMatches = selected.length > 0 && selected.join("・") === chipPart;
  if (!chipPartMatches) return { selected: [], text: value };
  return { selected, text: rest };
}

export function composeChipsAndText(selected: string[], text: string): string {
  const chipPart = selected.join("・");
  const trimmedText = text.trim();
  if (chipPart && trimmedText) return `${chipPart} / ${trimmedText}`;
  return chipPart || trimmedText;
}

// チップ1つをトグルし、既存の自由記述テキスト部分は保ったまま値を組み直す。
export function toggleChipInValue(value: string | undefined, chip: string, chips: readonly string[]): string {
  const { selected, text } = splitChipsAndText(value, chips);
  const next = selected.includes(chip) ? selected.filter((c) => c !== chip) : [...selected, chip];
  return composeChipsAndText(next, text);
}
