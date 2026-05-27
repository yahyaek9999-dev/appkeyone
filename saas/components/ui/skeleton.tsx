import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("animate-pulse rounded-lg bg-white/[0.04]", className)} {...props} />
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

export function KpiCardSkeleton() {
  return (
    <div className="kpi-card space-y-3">
      <Skeleton className="h-8 w-8 rounded-xl" />
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-2.5 w-16" />
    </div>
  );
}

export function MessageBubbleSkeleton({ outgoing = false }: { outgoing?: boolean }) {
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
      className="grid items-center gap-3 border-b border-white/[0.06] px-4 py-3"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className="h-3 w-3/4" />
      ))}
    </div>
  );
}
