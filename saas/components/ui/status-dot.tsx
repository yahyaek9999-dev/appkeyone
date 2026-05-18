/**
 * KEYONE Tier-1 — StatusDot
 * Source: reference-extracts/tier1/shared/StatusDot.tsx
 * Use for: WhatsApp session, AI active, anti-ban cooldown, lead/agent presence.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusTone =
  | "online"
  | "offline"
  | "busy"
  | "warning"
  | "ai"
  | "neutral";

const TONE: Record<StatusTone, string> = {
  online: "bg-emerald-500",
  offline: "bg-slate-500",
  busy: "bg-rose-500",
  warning: "bg-amber-500",
  ai: "bg-violet-500",
  neutral: "bg-slate-400/60",
};

const SIZE = { xs: "size-1.5", sm: "size-2", md: "size-2.5" } as const;

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  pulse?: boolean;
  size?: keyof typeof SIZE;
  label?: string;
}

export function StatusDot({
  tone = "neutral",
  pulse = false,
  size = "sm",
  label,
  className,
  ...props
}: StatusDotProps) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      className={cn("relative inline-flex shrink-0", SIZE[size], className)}
      {...props}
    >
      {pulse && (
        <span
          className={cn(
            "absolute inset-0 rounded-full opacity-60 animate-ping",
            TONE[tone]
          )}
        />
      )}
      <span className={cn("relative size-full rounded-full", TONE[tone])} />
    </span>
  );
}
