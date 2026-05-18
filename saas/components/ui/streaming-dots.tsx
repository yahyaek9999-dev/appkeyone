/**
 * KEYONE Tier-1 — StreamingDots
 * Source: reference-extracts/tier1/chat/StreamingDots.tsx
 * Inline three-dot indicator (no bubble) for AI status / inline streaming.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export interface StreamingDotsProps {
  size?: "xs" | "sm" | "md";
  tone?: "muted" | "primary";
  className?: string;
}

const SIZE = { xs: "size-1", sm: "size-1.5", md: "size-2" } as const;

export function StreamingDots({
  size = "sm",
  tone = "muted",
  className,
}: StreamingDotsProps) {
  const dotClass = cn(
    "block rounded-full animate-bounce",
    SIZE[size],
    tone === "muted" ? "bg-slate-400/60" : "bg-brand-500"
  );
  return (
    <span
      className={cn("inline-flex items-center gap-1 align-middle", className)}
      aria-label="جاري التحميل"
    >
      <span className={dotClass} style={{ animationDelay: "0ms", animationDuration: "1.1s" }} />
      <span className={dotClass} style={{ animationDelay: "150ms", animationDuration: "1.1s" }} />
      <span className={dotClass} style={{ animationDelay: "300ms", animationDuration: "1.1s" }} />
    </span>
  );
}
