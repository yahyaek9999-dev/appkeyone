/**
 * KEYONE Tier-1 — TrendBadge
 * Source: reference-extracts/tier1/analytics/TrendBadge.tsx
 * Up/down arrow + percent delta. `invert` for "lower-is-better" metrics.
 */
import * as React from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TrendBadgeProps {
  /** Percent delta as a number (e.g. 12.4 means +12.4%). null/undefined = no data. */
  delta: number | null | undefined;
  /** True if a decrease is "good" (e.g. churn, response time). */
  invert?: boolean;
  size?: "sm" | "md";
  showSign?: boolean;
  className?: string;
}

export function TrendBadge({
  delta,
  invert = false,
  size = "sm",
  showSign = true,
  className,
}: TrendBadgeProps) {
  if (delta == null) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-slate-400",
          size === "sm" ? "text-[11px]" : "text-xs",
          className
        )}
      >
        <Minus className={size === "sm" ? "size-3" : "size-3.5"} />
        —
      </span>
    );
  }

  const isUp = delta > 0;
  const isDown = delta < 0;
  const isNeutral = delta === 0;
  const positive = invert ? isDown : isUp;
  const negative = invert ? isUp : isDown;

  const tone = isNeutral
    ? "text-slate-400"
    : positive
    ? "text-emerald-400"
    : negative
    ? "text-rose-400"
    : "text-slate-400";

  const Icon = isNeutral ? Minus : isUp ? ArrowUp : ArrowDown;
  const iconClass = size === "sm" ? "size-3" : "size-3.5";
  const formatted = `${showSign && delta > 0 ? "+" : ""}${delta.toFixed(1)}%`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium tabular-nums",
        size === "sm" ? "text-[11px]" : "text-xs",
        tone,
        className
      )}
    >
      <Icon className={iconClass} />
      {formatted}
    </span>
  );
}
