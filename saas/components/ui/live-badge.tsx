"use client";

import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export type LiveState = "connecting" | "live" | "fallback" | "offline";

const STATE: Record<LiveState, { label: string; cls: string; dot: string }> = {
  connecting: {
    label: "جاري الاتصال",
    cls: "border-amber-500/25 bg-amber-500/10 text-amber-200",
    dot: "bg-amber-400",
  },
  live: {
    label: "Live",
    cls: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
    dot: "bg-emerald-400",
  },
  fallback: {
    label: "تحديث دوري",
    cls: "border-sky-500/25 bg-sky-500/10 text-sky-200",
    dot: "bg-sky-400",
  },
  offline: {
    label: "غير متصل",
    cls: "border-slate-500/25 bg-slate-500/10 text-slate-300",
    dot: "bg-slate-400",
  },
};

export function LiveBadge({
  state,
  label,
  className,
}: {
  state: LiveState;
  label?: string;
  className?: string;
}) {
  const cfg = STATE[state];
  const Icon = state === "offline" ? WifiOff : Wifi;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm",
        cfg.cls,
        className,
      )}
      role="status"
      aria-label={label || cfg.label}
    >
      <span className="relative flex size-2">
        {state === "live" && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", cfg.dot)} />}
        <span className={cn("relative inline-flex size-2 rounded-full", cfg.dot)} />
      </span>
      <Icon className="size-3" />
      {label || cfg.label}
    </span>
  );
}

export function AiActivityPill({ active, text }: { active: boolean; text?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
        active
          ? "border-gold-500/30 bg-gold-500/10 text-gold-200"
          : "border-white/10 bg-white/5 text-slate-400",
      )}
    >
      <span className="relative flex size-2">
        {active && <span className="absolute inline-flex size-full animate-ping rounded-full bg-gold-400 opacity-60" />}
        <span className={cn("relative inline-flex size-2 rounded-full", active ? "bg-gold-400" : "bg-slate-500")} />
      </span>
      {text || (active ? "المساعد يعمل الآن" : "المساعد جاهز")}
    </span>
  );
}
