/**
 * Teams — the customer surface for the Enterprise `multi_team` capability
 * ("فرق متعدّدة مع صلاحيات منفصلة").
 *
 * Two independent gates, in the order that matters:
 *   1. RBAC — managing teams is the "team" permission (owner + workspace admin).
 *      A sales/support/viewer member is bounced, matching the API's 403.
 *   2. PLAN — pageGate("multi_team") + <LockedFeature>, so a lower tier still
 *      REACHES this page from the sidebar and is shown the upgrade path rather
 *      than having the destination hidden from them.
 *
 * The RBAC redirect comes first on purpose: a viewer must not be told which
 * capabilities the workspace's plan does or does not include.
 */

import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import TeamsUi from "./teams-ui";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "team")) redirect("/dashboard");

  const g = await pageGate("multi_team");
  if (!g.uid) redirect("/login");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="فرق متعدّدة مع صلاحيات منفصلة"
          description="قسّم موظفيك إلى فرق، وامنح كل فريق نطاق محادثات وأرقام واتساب خاصة به — بحيث لا يرى فريق بيانات فريق آخر. متاح في باقة Enterprise."
        />
      </div>
    );
  }

  return <TeamsUi />;
}
