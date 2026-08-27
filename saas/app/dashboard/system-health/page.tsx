/**
 * /dashboard/system-health — the CUSTOMER health page.
 *
 * This route is in the الإعدادات sidebar and gates on `system_health`, a
 * capability sold from Pro up. It used to render the platform ops console,
 * whose endpoint is admin-only by design (host CPU/RAM, DB size, cross-tenant
 * counts) — so every merchant who opened the feature they had paid for got a
 * 403, which the UI reported as an expired session.
 *
 * It now renders the tenant view: /api/system/health/me. The platform console
 * and its admin-only endpoint are untouched and still reachable from the admin
 * workspace.
 */
import { redirect } from "next/navigation";
import TenantHealthUi from "./tenant-health-ui";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";

export const dynamic = "force-dynamic";

export default async function SystemHealthPage() {
  const gate = await pageGate("system_health");
  if (!gate.uid) redirect("/login");
  if (!gate.allowed)
    return (
      <LockedFeature
        locale="ar"
        title="صحة حسابك"
        description="تابع حالة اتصال واتساب وأرقامك وتسليم رسائلك وتكاملاتك في شاشة واحدة. متاح في باقة Pro فأعلى."
        recommendedTier={gate.recommendedTier}
      />
    );
  return <TenantHealthUi />;
}
