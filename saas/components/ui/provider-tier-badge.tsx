/**
 * ProviderTierBadge — surfaces model tier without exposing raw provider names.
 */
import * as React from "react";
import { Zap, Scale, Sparkles, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProviderTier = "fast" | "balanced" | "quality" | "private";

const TIER_META: Record<
  ProviderTier,
  { label: string; icon: React.ReactNode; classes: string }
> = {
  fast: {
    label: "سريع",
    icon: <Zap className="size-3" />,
    classes: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
  },
  balanced: {
    label: "متوازن",
    icon: <Scale className="size-3" />,
    classes: "bg-sky-500/10 text-sky-300 ring-sky-500/20",
  },
  quality: {
    label: "جودة عالية",
    icon: <Sparkles className="size-3" />,
    classes: "bg-gold-500/10 text-gold-300 ring-gold-500/20",
  },
  private: {
    label: "خاص",
    icon: <Lock className="size-3" />,
    classes: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
  },
};

export interface ProviderTierBadgeProps {
  tier: ProviderTier;
  /** Hide label, show icon only (for compact rows) */
  iconOnly?: boolean;
  className?: string;
}

export function ProviderTierBadge({
  tier,
  iconOnly = false,
  className,
}: ProviderTierBadgeProps) {
  const meta = TIER_META[tier];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset",
        meta.classes,
        className
      )}
      aria-label={`المستوى: ${meta.label}`}
    >
      {meta.icon}
      {!iconOnly && <span className="leading-none">{meta.label}</span>}
    </span>
  );
}
