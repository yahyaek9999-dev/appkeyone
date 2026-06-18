/**
 * One-Time QR Import — admin control center (Phase 3).
 *
 * Platform-wide view of every tenant's import: a sessions queue with status +
 * counts + user email, queue/slot monitoring, per-session logs, aggregate
 * statistics, and retry/cancel controls. All data + interactivity live in the
 * client. Admin access is enforced by the /admin layout (and every API route
 * re-checks requireAdmin()).
 */
import AdminImportClient from "./admin-import-client";

export const dynamic = "force-dynamic";

export default function AdminImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">استيراد العملاء</h1>
        <p className="page-desc">
          متابعة عمليات الاستيراد لمرة واحدة عبر كل التجار — الطابور، المراقبة، السجلات، والإحصائيات، مع إعادة المحاولة والإلغاء.
        </p>
      </div>
      <AdminImportClient />
    </div>
  );
}
