/**
 * KEYONE Tier-1 — LeadStatusBadge
 * Source: reference-extracts/tier1/crm/LeadStatusBadge.tsx
 * Adapted: Arabic labels matching KEYONE lead lifecycle.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "hot"
  | "customer"
  | "cold"
  | "lost";

const STATUS_MAP: Record<LeadStatus, { label: string; classes: string }> = {
  new: {
    label: "جديد",
    classes: "bg-sky-500/10 text-sky-300 ring-sky-500/20",
  },
  contacted: {
    label: "تم التواصل",
    classes: "bg-teal-500/10 text-teal-300 ring-teal-500/20",
  },
  qualified: {
    label: "مؤهَّل",
    classes: "bg-gold-500/10 text-gold-300 ring-gold-500/20",
  },
  hot: {
    label: "ساخن",
    classes: "bg-rose-500/10 text-rose-300 ring-rose-500/20",
  },
  customer: {
    label: "عميل",
    classes: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
  },
  cold: {
    label: "بارد",
    classes: "bg-slate-500/10 text-slate-300 ring-slate-500/20",
  },
  lost: {
    label: "ضائع",
    classes: "bg-stone-500/10 text-stone-400 ring-stone-500/20 line-through",
  },
};

export interface LeadStatusBadgeProps {
  status: LeadStatus;
  /** Override the visible label without changing the color tone */
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

export function LeadStatusBadge({
  status,
  label,
  size = "sm",
  className,
}: LeadStatusBadgeProps) {
  const meta = STATUS_MAP[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        meta.classes,
        className
      )}
    >
      {label ?? meta.label}
    </span>
  );
}
