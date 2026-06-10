import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import AnalyticsUi from "./analytics-ui";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const g = await pageGate("advanced_analytics");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="التحليلات المتقدّمة"
          description="حلّل أداء مبيعاتك ورسائلك بعمق واكتشف ما الذي يزيد إيرادك بالضبط. متاحة في باقة Pro فأعلى."
        />
      </div>
    );
  }
  return <AnalyticsUi />;
}
