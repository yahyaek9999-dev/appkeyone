// Dashboard segment loading state (App Router convention). Wraps every
// dashboard page.tsx in a Suspense boundary automatically — without this,
// server-rendered pages that query the DB directly (orders, customers, ...)
// showed a frozen/blank screen with zero feedback until the query resolved.
// Generic by design: this is the segment-wide fallback shown for any
// dashboard route without a more specific loading.tsx of its own.
import { KpiCardSkeleton, TableRowSkeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>
      <div className="card overflow-hidden p-0">
        {Array.from({ length: 6 }).map((_, i) => (
          <TableRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
