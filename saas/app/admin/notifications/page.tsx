// /admin/notifications — Admin Notification Center.
//
// Aggregates the SAME real cross-domain signals the Command Center surfaces
// (lib/admin/attention + finance signals) into one actionable list. No duplicate
// signal logic. Acknowledge/resolve state is per-admin and kept client-side
// (localStorage) — there is no app model for admin-notification state, and the
// task forbids invasive schema changes, so we never fabricate a server store.
import { getOpsAttentionSignals } from "@/lib/admin/attention";
import { getFinanceAttentionSignals } from "@/lib/admin/finance-reconcile";
import NotificationCenter from "./notification-center";
import { PageHeader } from "../_ui/primitives";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  const [ops, finance] = await Promise.all([
    getOpsAttentionSignals().catch(() => []),
    getFinanceAttentionSignals().catch(() => []),
  ]);

  // Normalise finance signals into the same shape.
  const financeSignals = finance.map((f, i) => ({
    id: `finance_${i}_${f.href}`,
    domain: "finance" as const,
    severity: f.severity === "critical" ? ("critical" as const) : ("warn" as const),
    area: f.area,
    problem: f.problem,
    cta: f.cta,
    href: f.href,
  }));

  const all = [...ops, ...financeSignals];
  // Stable severity ordering.
  const rank = { critical: 0, warn: 1, info: 2 } as Record<string, number>;
  all.sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3));

  return (
    <div>
      <PageHeader
        eyebrow="التشغيل"
        title="مركز الإشعارات"
        subtitle="إشعارات فعلية قابلة للتنفيذ من كل الأنظمة — الأمان، الحوادث، المالية، SLA، المخاطر، ونجاح العملاء."
      />
      <NotificationCenter signals={all} />
    </div>
  );
}
