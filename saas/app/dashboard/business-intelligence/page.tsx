import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import BusinessIntelligenceUi from "./business-intelligence-ui";

export const dynamic = "force-dynamic";

export default async function BusinessIntelligencePage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const g = await pageGate("advanced_analytics");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="ذكاء الأعمال"
          description="لوحات تحليلية متقدّمة تربط رسائلك بإيراداتك وتكشف فرص النمو. متاحة في باقة Pro فأعلى."
        />
      </div>
    );
  }
  return <BusinessIntelligenceUi />;
}
