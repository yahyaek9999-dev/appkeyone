import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import RecoveryUi from "./recovery-ui";

export const dynamic = "force-dynamic";

export default async function RecoveryPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  // Gate on `recovery` (tier 1 / Growth) — the capability this page actually
  // sells. It previously gated on `smart_campaign_builder` (tier 2 / Pro),
  // which locked Growth customers out of a feature their plan includes.
  const g = await pageGate("recovery");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="استعادة العملاء"
          description="حملات ذكية تستعيد العملاء المتعثّرين والسلات المتروكة قبل أن تخسرهم. متاح في باقة Pro فأعلى."
        />
      </div>
    );
  }
  return <RecoveryUi />;
}
