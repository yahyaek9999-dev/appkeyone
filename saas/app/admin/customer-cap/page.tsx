/**
 * Admin Customer-Cap dashboard — tenants near/over their CRM customer cap, with
 * the contracted-floor control. Admin-gated by the /admin layout. Read-only
 * observability + a safe (raise/set floor) control; never deletes customers.
 */
import { overCapTenants, customerCapEnforcementEnabled } from "@/lib/membership/customer-cap";
import { prisma } from "@/lib/db";
import { AlertCircle } from "lucide-react";
import CustomerCapClient from "./customer-cap-client";

export const dynamic = "force-dynamic";

export default async function AdminCustomerCapPage() {
  const rows = await overCapTenants({ limit: 100 }).catch(() => []);
  const userIds = rows.map((r) => r.userId);
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const enriched = rows.map((r) => ({ ...r, email: byId.get(r.userId)?.email || "—", name: byId.get(r.userId)?.name || null }));
  const enforcement = customerCapEnforcementEnabled();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">حدّ العملاء (CRM)</h1>
        <p className="page-desc">التجار القريبون من حدّ باقتهم أو المتجاوزون له. الحدّ مُمنوح بالأقدمية — لا يُحذف أي عميل.</p>
      </div>

      <div className={`rounded-xl border p-3 text-sm flex items-center gap-2 ${enforcement ? "border-amber-500/30 bg-amber-500/[0.06] text-amber-200" : "border-white/10 bg-white/[0.02] text-slate-300"}`}>
        <AlertCircle className="h-4 w-4" />
        {enforcement
          ? "التطبيق مُفعّل: إنشاء عملاء جدد فوق الحدّ المُمنوح بالأقدمية محجوب (العملاء الحاليون آمنون)."
          : "وضع المراقبة فقط: لا يوجد حجب. فعّل CUSTOMER_CAP_ENFORCEMENT=1 لبدء التطبيق الآمن."}
      </div>

      <CustomerCapClient initialRows={enriched} />
    </div>
  );
}
