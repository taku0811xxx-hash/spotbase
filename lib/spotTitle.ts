// 「ここトレ！」専用: スポットの表示タイトルを決めるフォールバック処理。
// 優先順位: ①name(タイトル/スポット名) → ②写真の場所名(POI・施設名) →
// ③住所(郵便番号を除いた短縮住所) → ④撮影日/エリアからの自動生成。
// 「無題の写真」のような固定文言や、〒付きの生の住所はそのまま表示しない。
import { getPhotoSpotPhotos } from "./photoSpots";
import type { PhotoSpot } from "./types/photoSpot";

const POSTAL_RE = /〒?\s*\d{3}\s*[-‐−ー]?\s*\d{4}/g;

// 郵便番号・「日本、」を除去して整形する。空になれば空文字を返す。
export function cleanAddress(raw?: string): string {
  if (!raw) return "";
  return raw
    .replace(POSTAL_RE, "")
    .replace(/^[\s、,]*日本[、,\s]*/, "")
    .replace(/[\s、,]+/g, " ")
    .trim();
}

// 住所から市区町村レベル(〜市/区/町/村)までの短縮形を作る。判別できなければ先頭16文字。
function shortenAddress(addr: string): string {
  const m = addr.match(/^(.*?[都道府県])?\s*(.+?[市区町村])/);
  if (m) return m[2];
  return addr.length > 16 ? addr.slice(0, 16) : addr;
}

function isBlankOrPlaceholder(s?: string): boolean {
  const t = (s ?? "").trim();
  return t === "" || t === "無題の写真" || t === "無題";
}

export function getSpotTitle(spot: PhotoSpot): string {
  // 1. 入力済みのタイトル(郵便番号のみ・生住所そのものだった場合は使わず、整形して住所扱いにする)
  const name = spot.name?.trim();
  if (!isBlankOrPlaceholder(name) && !/^〒/.test(name)) return name;

  // 2. ジオコーディング等で取得した施設名・場所名(住所と同一のものは除く)
  const address = cleanAddress(spot.address);
  for (const p of getPhotoSpotPhotos(spot)) {
    const loc = p.locationName?.trim();
    if (!isBlankOrPlaceholder(loc) && !/^〒/.test(loc) && cleanAddress(loc) !== address) return loc;
  }

  // 3. 短縮住所(name自体が〒付き住所だった場合もここで整形される)
  const fromName = /^〒/.test(name ?? "") ? cleanAddress(name) : "";
  const addr = address || fromName;
  if (addr) return shortenAddress(addr);

  // 4. 撮影日/投稿日から生成
  const dateStr = spot.exif?.shotAt ?? getPhotoSpotPhotos(spot).find((p) => p.exif?.shotAt)?.exif?.shotAt ?? spot.postedAt;
  const d = dateStr ? new Date(dateStr) : null;
  if (d && !isNaN(d.getTime())) return `${d.getMonth() + 1}月${d.getDate()}日の撮影スポット`;
  return "撮影スポット";
}
