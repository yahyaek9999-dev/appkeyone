/**
 * KEYONE Tier-1 — LoadingSkeleton + presets
 * Source: reference-extracts/tier1/shared/LoadingSkeleton.tsx
 * SSR-safe; pure CSS pulse on slate background.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-white/5", className)}
      {...props}
    />
  );
}

export function ConversationListItemSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <Skeleton className="size-9 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-2 w-10" />
        </div>
        <Skeleton className="h-2.5 w-3/4" />
      </div>
    </div>
  );
}

export function CustomerCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-7" />
        <Skeleton className="h-7" />
      </div>
    </div>
  );
}

export function KpiCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-2.5 w-16" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export function MessageBubbleSkeleton({
  outgoing = false,
}: {
  outgoing?: boolean;
}) {
  return (
    <div className={cn("flex w-full", outgoing ? "justify-end" : "justify-start")}>
      <div className="max-w-[70%] space-y-1.5">
        <Skeleton className={cn("h-3", outgoing ? "w-44" : "w-52")} />
        <Skeleton className={cn("h-3", outgoing ? "w-32" : "w-40")} />
      </div>
    </div>
  );
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <div
      className="grid items-center gap-3 px-3 py-3 border-b border-white/10"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className="h-3 w-3/4" />
      ))}
    </div>
  );
}
