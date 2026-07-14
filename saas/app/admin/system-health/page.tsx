// Thin wrapper surfacing the existing tenant-side system-health dashboard
// (app/dashboard/system-health) under /admin — same component, same data
// (DB/Redis/queue/worker/AI-provider aggregation), just reachable from the
// admin nav instead of only via the dashboard help drawer. Auth is already
// enforced by app/admin/layout.tsx (owner+admin only).
import SystemHealthUi from "@/app/dashboard/system-health/system-health-ui";

export const dynamic = "force-dynamic";

export default function AdminSystemHealthPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">صحة النظام</h1>
        <p className="text-sm text-slate-400">حالة قاعدة البيانات، الطوابير، مزوّدي الذكاء الاصطناعي، والموارد — عبر المنصة بالكامل.</p>
      </div>
      <SystemHealthUi />
    </div>
  );
}
