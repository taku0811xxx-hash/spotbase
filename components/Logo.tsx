import { APP_MODE } from "@/lib/config";

type Props = {
  className?: string;
  iconOnly?: boolean;
  size?: "sm" | "lg";
  title?: string; // ワードマーク文字列(省略時は"SpotBase"。マルチプロダクト対応でモードごとに差し替え可能)
};

const GRADIENT =
  "linear-gradient(135deg, #ffffff 0%, #c7cdd4 45%, #ffffff 70%, #9aa3ad 100%)";

const DIMENSIONS = {
  sm: { fontSize: 26, boxWidth: 64, boxHeight: 44, sTop: 8, sLeft: 2, bTop: 18, bLeft: 16 },
  lg: { fontSize: 52, boxWidth: 130, boxHeight: 90, sTop: 18, sLeft: 4, bTop: 38, bLeft: 32 },
};

const KOKOTORE_FONT_SIZES = { sm: 20, lg: 40 };

// 写真共有アプリらしい、親しみやすくポップな配色(オレンジ→ピンクのグラデーション)。
// SpotBase本体の銀白グラデーション(GRADIENT)とは意図的に差別化している。
const KOKOTORE_GRADIENT =
  "linear-gradient(135deg, #ff9a56 0%, #ff6f91 50%, #ffb86b 100%)";

// 「ここトレ！」(photoモード)専用のテキストロゴ。SpotBase本体の「SB」モノグラムとは
// 別デザイン(丸ゴシック体+ポップな配色)とし、photoモード上にSpotBaseの表記が
// 一切残らないようにする。
function KokotoreLogo({ className, size }: { className: string; size: "sm" | "lg" }) {
  return (
    <div className={`flex items-center ${className}`}>
      <span
        className="font-extrabold whitespace-nowrap tracking-tight"
        style={{
          fontFamily: "'M PLUS Rounded 1c', 'Zen Maru Gothic', sans-serif",
          fontSize: KOKOTORE_FONT_SIZES[size],
          lineHeight: 1,
          background: KOKOTORE_GRADIENT,
          WebkitBackgroundClip: "text" as const,
          backgroundClip: "text" as const,
          color: "transparent",
        }}
      >
        ここトレ！
      </span>
    </div>
  );
}

// SpotBaseのロゴ。「S」と「B」を斜体・白銀グラデーションで重ねたモノグラム。
// 黒系の背景(ヘッダーバーなど)の上に置く前提のデザイン。
// photoモード("ここトレ！")では、SBモノグラムを一切描画せず専用テキストロゴに差し替える。
export default function Logo({ className = "", iconOnly = false, size = "sm", title = "SpotBase" }: Props) {
  if (APP_MODE === "photo") {
    return <KokotoreLogo className={className} size={size} />;
  }

  const d = DIMENSIONS[size];
  const letterStyle = (top: number, left: number, extraPadding = 0) => ({
    left,
    top,
    paddingRight: extraPadding,
    fontFamily: "'Fraunces', serif",
    fontSize: d.fontSize,
    lineHeight: 1,
    background: GRADIENT,
    WebkitBackgroundClip: "text" as const,
    backgroundClip: "text" as const,
    color: "transparent",
  });

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span
        className="relative inline-block flex-shrink-0"
        style={{ width: d.boxWidth, height: d.boxHeight }}
      >
        <span
          className="absolute font-black italic whitespace-nowrap"
          style={letterStyle(d.sTop, d.sLeft)}
        >
          S
        </span>
        <span
          className="absolute font-black italic whitespace-nowrap"
          style={letterStyle(d.bTop, d.bLeft, 20)}
        >
          B
        </span>
      </span>
      {!iconOnly && (
        // 狭い画面(スマホ幅)ではヘッダーの他要素(ハンバーガー/新規出動/出動中等)と
        // 詰まってしまうため、ワードマーク文字は sm(640px)以上でのみ表示する
        <span className="hidden sm:inline-block font-bold text-lg tracking-tight">{title}</span>
      )}
    </div>
  );
}
