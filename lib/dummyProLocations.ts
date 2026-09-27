// SpotBase本体(APP_MODE === 'pro')専用のダミー現場データ。
// 「ここトレ！」向けのlib/dummyPhotoSpots.ts(PhotoSpot型・"photo_spots"コレクション)とは
// 配列・型ともに完全に分離している。
//
// Firestoreへの本格的な投入は scripts/seed-tokyo-pins.mjs / scripts/seed-outdoor-pins.mjs
// (いずれもpins コレクション専用)で行う想定のため、ここでは開発時のプレビュー用途の
// 最小限のサンプルのみを保持する。
import type { Timestamp } from "firebase/firestore";
import type { ProLocation } from "./types/proLocation";

export const DUMMY_PRO_LOCATIONS: Omit<ProLocation, "recordedAt">[] = [
  {
    id: "dummy-pro-location-1",
    name: "国立競技場 正面玄関前",
    referenceId: "LOC-2026-0001",
    address: "東京都新宿区霞ヶ丘町10-1",
    lat: 35.6779,
    lng: 139.7147,
    parkingInfo: "西側来客用駐車場(要事前申請)",
    shootingSpots: "正面玄関前・聖火台脇の2箇所",
    ipTransmissionInfo: "docomo/au良好、softbank弱め",
    fpuInfo: "屋上中継車スペースあり",
    hazards: "イベント開催日は一般来場者が多く動線が混雑",
    photoUrls: [],
    parkingPhotoUrls: [],
    shootingPhotoUrls: [],
    hazardPhotoUrls: [],
    organizationId: "dummy-org",
    category: "記者",
    recordedBy: "ダミー担当者",
  },
];

export type { Timestamp };
