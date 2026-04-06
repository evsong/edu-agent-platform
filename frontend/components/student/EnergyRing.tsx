"use client";

interface EnergyRingProps {
  mastery: number;
  label: string;
  size?: number;
}

export default function EnergyRing({
  mastery,
  label,
  size = 80,
}: EnergyRingProps) {
  const strokeWidth = size * 0.08;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - mastery * circumference;
  const pct = Math.round(mastery * 100);

  // Color states based on mastery
  const isLow = mastery < 0.3;
  const isHigh = mastery >= 0.8;

  const gradientId = `ring-grad-${label.replace(/\s/g, "-")}`;

  let strokeColor: string;
  if (isLow) {
    strokeColor = "#DC2626";
  } else if (isHigh) {
    strokeColor = `url(#${gradientId})`;
  } else {
    strokeColor = "#4338CA";
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        <defs>
          {isHigh && (
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#7C3AED" />
            </linearGradient>
          )}
        </defs>

        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#F3F4F6"
          strokeWidth={strokeWidth}
          strokeDasharray={isLow ? "4 4" : "none"}
        />

        {/* Foreground arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${mastery * circumference} ${circumference}`}
          strokeDashoffset={0}
          style={{
            transition: "stroke-dasharray 0.6s ease-in-out",
          }}
        />

        {/* Center text */}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill={isLow ? "#DC2626" : isHigh ? "#D97706" : "#4338CA"}
          fontSize={size * 0.22}
          fontWeight="700"
          fontFamily="var(--font-display)"
          style={{ transform: "rotate(90deg)", transformOrigin: "center" }}
        >
          {pct}%
        </text>
      </svg>
      <span className="text-xs text-ink-text-muted text-center leading-tight max-w-[80px] truncate">
        {label}
      </span>
    </div>
  );
}
