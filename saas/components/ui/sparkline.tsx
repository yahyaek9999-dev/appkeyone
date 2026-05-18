/**
 * KEYONE Tier-1 — Sparkline
 * Source: reference-extracts/tier1/shared/Sparkline.tsx
 * Pure SVG, no charting lib. Auto-normalizes input.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

type SvgPassthrough = Omit<React.SVGAttributes<SVGSVGElement>, "fill">;

export interface SparklineProps extends SvgPassthrough {
  data: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  /** Render gradient area under the line */
  fill?: boolean;
  showLastPoint?: boolean;
  tone?: "primary" | "positive" | "negative" | "neutral";
}

const TONE = {
  primary: "text-brand-400",
  positive: "text-emerald-400",
  negative: "text-rose-400",
  neutral: "text-slate-400",
} as const;

export function Sparkline({
  data,
  width = 120,
  height = 36,
  strokeWidth = 1.5,
  fill = true,
  showLastPoint = true,
  tone = "primary",
  className,
  ...props
}: SparklineProps) {
  const gradientId = React.useId();

  if (!data || data.length < 2) {
    return <div className={cn("h-[36px] w-full", className)} aria-hidden />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return [x, y] as const;
  });

  const path = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");

  const area = `${path} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={cn(TONE[tone], className)}
      {...props}
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
        </>
      )}
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showLastPoint && (
        <circle
          cx={last[0]}
          cy={last[1]}
          r={strokeWidth + 0.5}
          fill="currentColor"
        />
      )}
    </svg>
  );
}
