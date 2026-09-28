// 「ここトレ！」撮影準備タブ専用: 指定した緯度経度・日付から、日の出/日の入り・
// ゴールデンアワー/マジックアワー(ブルーアワー)の目安時刻と、現在の太陽の方位・
// 高度を計算する軽量ユーティリティ。外部ライブラリを追加せず、標準的な太陽位置
// 計算式(NOAA/Jean Meeusの近似式に基づく)を自前実装している。
// 分単位の精度で十分なロケハン用途のため、大気差・章動等の高精度補正は行わない。
// (各数値の妥当性は、東京の夏至の日の出/日の入り/南中高度等の既知値と突き合わせて検証済み)

const RAD = Math.PI / 180;
const DAY_MS = 1000 * 60 * 60 * 24;
const J1970 = 2440588;
const J2000 = 2451545;
const J0 = 0.0009;
const OBLIQUITY = RAD * 23.4397; // 地軸の傾き

function toJulian(date: Date): number {
  return date.valueOf() / DAY_MS - 0.5 + J1970;
}

function fromJulian(j: number): Date {
  return new Date((j + 0.5 - J1970) * DAY_MS);
}

function toDays(date: Date): number {
  return toJulian(date) - J2000;
}

function rightAscension(l: number, b: number): number {
  return Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
}

function declination(l: number, b: number): number {
  return Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
}

function solarMeanAnomaly(d: number): number {
  return RAD * (357.5291 + 0.98560028 * d);
}

function eclipticLongitude(M: number): number {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = RAD * 102.9372; // 近日点黄経
  return M + C + P + Math.PI;
}

function siderealTime(d: number, lw: number): number {
  return RAD * (280.16 + 360.9856235 * d) - lw;
}

function azimuthAltitude(H: number, phi: number, dec: number): { azimuth: number; altitude: number } {
  const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const azSouthBased = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  // 天文学の定義(南=0)をコンパス方位(北=0, 東=90, 南=180, 西=270)へ変換する
  const compassAzimuth = (azSouthBased / RAD + 180 + 360) % 360;
  return { azimuth: compassAzimuth, altitude: altitude / RAD };
}

export type SunPosition = {
  azimuth: number; // 度。0=北, 90=東, 180=南, 270=西
  altitude: number; // 度。0=地平線、90=天頂
};

// 指定した日時・緯度経度における太陽の方位・高度を返す(順光/逆光の把握用)。
export function getSunPosition(date: Date, lat: number, lng: number): SunPosition {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const d = toDays(date);
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const ra = rightAscension(L, 0);
  const H = siderealTime(d, lw) - ra;
  return azimuthAltitude(H, phi, dec);
}

function julianCycle(d: number, lw: number): number {
  return Math.round(d - J0 - lw / (2 * Math.PI));
}

function approxTransit(Ht: number, lw: number, n: number): number {
  return J0 + (Ht + lw) / (2 * Math.PI) + n;
}

function solarTransitJ(ds: number, M: number, L: number): number {
  return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
}

function hourAngle(h: number, phi: number, dec: number): number {
  return Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
}

// 太陽が指定高度(度)へ沈む/昇るユリウス日を求める(NOAA/SunCalc方式の近似式)。
// 見つからない場合(白夜・極夜等でcosが範囲外)はNaNを返す。
function getSetJ(h: number, lw: number, phi: number, dec: number, n: number, M: number, L: number): number {
  const w = hourAngle(h, phi, dec);
  if (Number.isNaN(w)) return NaN;
  const a = approxTransit(w, lw, n);
  return solarTransitJ(a, M, L);
}

function sunTimeAtAltitude(date: Date, lat: number, lng: number, altitudeDeg: number): { rise: Date | null; set: Date | null; noon: Date } {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const Jnoon = solarTransitJ(ds, M, L);

  const h0 = RAD * altitudeDeg;
  const Jset = getSetJ(h0, lw, phi, dec, n, M, L);
  if (Number.isNaN(Jset)) {
    return { rise: null, set: null, noon: fromJulian(Jnoon) };
  }
  const Jrise = Jnoon - (Jset - Jnoon);
  return { rise: fromJulian(Jrise), set: fromJulian(Jset), noon: fromJulian(Jnoon) };
}

export type SunTimes = {
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
  // ゴールデンアワー(柔らかい暖色の光): 日の出後〜太陽高度6度まで/日の入り前(高度6度)〜日没まで
  goldenHourMorningEnd: Date | null;
  goldenHourEveningStart: Date | null;
  // マジックアワー/ブルーアワー: 太陽高度がおよそ-6度〜-4度の薄明時間帯
  duskBlueHourStart: Date | null; // 夕方: 日没後の青みがかった時間帯の開始
  duskBlueHourEnd: Date | null;
  dawnBlueHourStart: Date | null; // 朝: 日の出前の青みがかった時間帯
  dawnBlueHourEnd: Date | null;
};

// 指定した日付・緯度経度における日の出/日の入り・ゴールデン/マジックアワーの
// 目安時刻をまとめて返す。
export function getSunTimes(date: Date, lat: number, lng: number): SunTimes {
  const standard = sunTimeAtAltitude(date, lat, lng, -0.833);
  const golden = sunTimeAtAltitude(date, lat, lng, 6);
  const blue = sunTimeAtAltitude(date, lat, lng, -4);
  const dark = sunTimeAtAltitude(date, lat, lng, -6);

  return {
    sunrise: standard.rise,
    sunset: standard.set,
    solarNoon: standard.noon,
    goldenHourMorningEnd: golden.rise,
    goldenHourEveningStart: golden.set,
    duskBlueHourStart: blue.set,
    duskBlueHourEnd: dark.set,
    dawnBlueHourStart: dark.rise,
    dawnBlueHourEnd: blue.rise,
  };
}

// 方位角(度)を8方位の日本語表記に変換する(簡易コンパス表示用)
export function azimuthToCompassLabel(azimuth: number): string {
  const labels = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
  const index = Math.round(azimuth / 45) % 8;
  return labels[index];
}
