// SpotBase本体(APP_MODE === 'pro')専用のデータ型。
// 放送・報道クルー向け現場ロケハン情報(駐車場所・伝送状況・危険箇所・図面等)を持つ、
// 法人向けの現場データを表す。ここトレ！(photoモード)の PhotoSpot 型
// (lib/types/photoSpot.ts)とは完全に独立しており、互いのフィールドに依存しない。
//
// 実体は従来の Pin 型(lib/pins.ts)と同じ形状。既存のpro向けコード(Map.tsx,
// PinForm.tsx, pinSync.ts等)は "pins" コレクション・Pin型を通じて広く参照されて
// いるため、実装の破壊的な全面書き換えは避け、ProLocation は Pin の別名として
// 提供する(=同一のFirestore「pins」コレクションを指す、SpotBase本体専用の型)。
// 新規にpro向けコードを書く場合は、意味が明確になるこちらの名前を使うこと。
export type { Pin as ProLocation, PinExif as ProLocationExif, PinDrawing, PinCustomField } from "@/lib/pins";
