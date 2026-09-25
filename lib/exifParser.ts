// 「ここトレ！」の投稿フロー(PhotoUploadModal)向け: 写真ファイルのExifメタデータを
// 解析し、カメラ・レンズ・撮影設定・位置情報をフォームへ自動反映するためのユーティリティ。
// exifreader(軽量なWeb対応Exif解析ライブラリ)を使用する。
import ExifReader from "exifreader";
import type { PhotoSpotTimeOfDay } from "./types/photoSpot";

export type ParsedExif = {
  camera?: string;
  lens?: string;
  fNumber?: number;
  exposureTime?: string;
  iso?: number;
  focalLength?: string;
  timeOfDay?: PhotoSpotTimeOfDay;
  position?: { lat: number; lng: number };
};

// 撮影時刻(時)から、おおまかな撮影時間帯を判定する。
// 早朝: 4-8時 / 昼: 8-16時 / 夕景: 16-19時 / 夜景: 19-4時
function timeOfDayFromHour(hour: number): PhotoSpotTimeOfDay {
  if (hour >= 4 && hour < 8) return "早朝";
  if (hour >= 8 && hour < 16) return "昼";
  if (hour >= 16 && hour < 19) return "夕景";
  return "夜景";
}

// EXIFのDateTimeOriginalは "YYYY:MM:DD HH:MM:SS" 形式の文字列
function parseExifDateTimeHour(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^\d{4}:\d{2}:\d{2} (\d{2}):/);
  if (!match) return null;
  return Number(match[1]);
}

// シャッタースピードを "1/250" のような表示形式に整形する
function formatExposureTime(seconds: number | undefined): string | undefined {
  if (seconds == null || !Number.isFinite(seconds)) return undefined;
  if (seconds >= 1) return `${seconds}s`;
  const denominator = Math.round(1 / seconds);
  return `1/${denominator}`;
}

export async function parseExif(file: File): Promise<ParsedExif> {
  try {
    const tags = await ExifReader.load(file, { expanded: true });
    const exif = tags.exif;
    const gps = tags.gps;

    const result: ParsedExif = {};

    const camera = exif?.Model?.description;
    if (camera) result.camera = camera;

    const lens = exif?.LensModel?.description;
    if (lens) result.lens = lens;

    const fNumberDesc = exif?.FNumber?.description;
    if (fNumberDesc) {
      const n = Number(fNumberDesc.replace(/^f\//i, ""));
      if (Number.isFinite(n)) result.fNumber = n;
    }

    const exposureValue = exif?.ExposureTime?.value;
    const exposureSeconds = Array.isArray(exposureValue)
      ? Number(exposureValue[0]) / Number(exposureValue[1] ?? 1)
      : undefined;
    const formattedExposure = formatExposureTime(exposureSeconds);
    if (formattedExposure) result.exposureTime = formattedExposure;

    const isoValue = exif?.ISOSpeedRatings?.value;
    const iso = Array.isArray(isoValue) ? isoValue[0] : isoValue;
    if (typeof iso === "number") result.iso = iso;

    const focalLengthDesc = exif?.FocalLength?.description;
    if (focalLengthDesc) result.focalLength = focalLengthDesc;

    const hour = parseExifDateTimeHour(exif?.DateTimeOriginal?.description);
    if (hour != null) result.timeOfDay = timeOfDayFromHour(hour);

    if (typeof gps?.Latitude === "number" && typeof gps?.Longitude === "number") {
      result.position = { lat: gps.Latitude, lng: gps.Longitude };
    }

    return result;
  } catch {
    // Exifが含まれていない・破損している画像(SNS保存画像等)は手入力にフォールバック
    return {};
  }
}
