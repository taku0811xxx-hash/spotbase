type Props = {
  className?: string;
  iconOnly?: boolean;
  size?: "sm" | "lg";
};

const GRADIENT =
  "linear-gradient(135deg, #ffffff 0%, #c7cdd4 45%, #ffffff 70%, #9aa3ad 100%)";

const DIMENSIONS = {
  sm: { fontSize: 26, boxWidth: 64, boxHeight: 44, sTop: 8, sLeft: 2, bTop: 18, bLeft: 16 },
  lg: { fontSize: 52, boxWidth: 130, boxHeight: 90, sTop: 18, sLeft: 4, bTop: 38, bLeft: 32 },
};

// SpotBaseのロゴ。「S」と「B」を斜体・白銀グラデーションで重ねたモノグラム。
// 黒系の背景(ヘッダーバーなど)の上に置く前提のデザイン。
export default function Logo({ className = "", iconOnly = false, size = "sm" }: Props) {
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
        <span className="font-bold text-lg tracking-tight">SpotBase</span>
      )}
    </div>
  );
}
