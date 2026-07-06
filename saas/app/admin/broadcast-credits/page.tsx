/**
 * Admin broadcast-credit super-center ("رصيد الحملات").
 *
 * Platform credit totals (sum of balances, purchased, spent), the QR slot queue
 * monitor (counts by status + force stop/start), per-tenant credit control
 * (grant/deduct), and the purchase-approval queue. Admin-gated by the /admin
 * layout. All interactive panels live in the client component.
 */
import { AdminBroadcastCreditsClient } from "./admin-broadcast-credits-client";

export const dynamic = "force-dynamic";

export default function AdminBroadcastCreditsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title mb-1">رصيد الحملات</h1>
          <p className="page-desc">
            أرصدة الحملات لكل تاجر، مراقبة طابور جلسات QR، التحكم في الرصيد، ومراجعة طلبات الشراء — يُحسب من السجلات الفعلية.
          </p>
        </div>
      </div>
      <AdminBroadcastCreditsClient />
    </div>
  );
}
