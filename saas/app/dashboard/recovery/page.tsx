import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import RecoveryUi from "./recovery-ui";

export const dynamic = "force-dynamic";

export default async function RecoveryPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const g = await pageGate("smart_campaign_builder");
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
