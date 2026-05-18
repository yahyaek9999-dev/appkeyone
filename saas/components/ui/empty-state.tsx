/**
 * KEYONE Tier-1 — EmptyState
 * Source: reference-extracts/tier1/shared/EmptyState.tsx
 * Use anywhere a list/section is empty (inbox, leads, orders, search).
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

const SIZE_CONFIG = {
  sm: { wrap: "py-8 gap-2", icon: "size-8", title: "text-sm", desc: "text-xs" },
  md: { wrap: "py-12 gap-3", icon: "size-10", title: "text-base", desc: "text-sm" },
  lg: { wrap: "py-20 gap-4", icon: "size-14", title: "text-lg", desc: "text-sm" },
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = "md",
  className,
  ...props
}: EmptyStateProps) {
  const s = SIZE_CONFIG[size];
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center text-center px-6",
        s.wrap,
        className
      )}
      {...props}
    >
      {icon && (
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-white/5 text-slate-400",
            s.icon === "size-8" ? "p-2" : s.icon === "size-10" ? "p-2.5" : "p-3"
          )}
        >
          <div className={s.icon}>{icon}</div>
        </div>
      )}
      <div className="space-y-1 max-w-sm">
        <h3 className={cn("font-medium text-slate-100", s.title)}>{title}</h3>
        {description && (
          <p className={cn("text-slate-400", s.desc)}>{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
