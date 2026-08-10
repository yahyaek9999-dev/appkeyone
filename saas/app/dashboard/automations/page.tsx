import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import AutomationBuilderUi from "./automation-builder-ui";
import RuleBuilderUi from "./rule-builder-ui";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const user = await requireUser();
  if (!user) redirect("/login");
  // Additive gate: only NEW-plan users below Growth see the upsell. Legacy and
  // no-subscription users keep full access (entitlements.enforce === false).
  const g = await pageGate("advanced_automations");
  if (g.uid && !g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="الأتمتة المتقدّمة"
          description="أتمتة المهام المتكرّرة وقواعد if-this-then-that. متاحة في باقة Growth فأعلى."
        />
      </div>
    );
  }
  return (
    <div className="space-y-10">
      {/* Phase 3: AI Copilot — one insight + recommendation + action for this page */}
      {/* Section 1: Commerce automations (existing — order-event → WA/email) */}
      <AutomationBuilderUi />
      {/* Section 2: Intelligent rule builder (Agent 3 — if-this-then-that) */}
      <div className="border-t border-white/[0.06] pt-8">
        <RuleBuilderUi />
      </div>
    </div>
  );
}
