import { Skeleton } from "@/components/ui/skeleton";

// Route-level loading boundary for every /dashboard/* navigation.
// Shape is page-agnostic (header → metric band → content cards) so it reads
// correctly for the overview, inbox, orders, and settings alike.
export default function DashboardLoading() {
    return (
        <div className="space-y-6" aria-busy="true" aria-live="polite">
            {/* Header: title + action chips */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2">
                    <Skeleton className="h-6 w-44" />
                    <Skeleton className="h-3 w-28" />
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-28 rounded-lg" />
                    <Skeleton className="h-8 w-24 rounded-lg" />
                </div>
            </div>

            {/* Metric band */}
            <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.018]">
                <div className="grid gap-px bg-white/[0.05] sm:grid-cols-2 lg:grid-cols-4">
                    <div className="bg-canvas-deep p-5 sm:col-span-2">
                        <Skeleton className="mb-3 h-3 w-32" />
                        <Skeleton className="mb-4 h-8 w-40" />
                        <Skeleton className="h-8 w-full" />
                    </div>
                    {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="bg-canvas-deep p-5">
                            <Skeleton className="mb-3 h-3 w-20" />
                            <Skeleton className="mb-4 h-7 w-16" />
                            <Skeleton className="h-3 w-24" />
                        </div>
                    ))}
                </div>
            </div>

            {/* Content cards */}
            <div className="grid gap-4 lg:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="card space-y-4 p-4">
                        <div className="flex items-center justify-between">
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-3 w-12" />
                        </div>
                        {Array.from({ length: 4 }).map((_, j) => (
                            <div key={j} className="flex items-center gap-3">
                                <Skeleton className="h-8 w-8 rounded-full" />
                                <div className="flex-1 space-y-1.5">
                                    <Skeleton className="h-3 w-3/5" />
                                    <Skeleton className="h-2.5 w-2/5" />
                                </div>
                                <Skeleton className="h-3 w-12" />
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
