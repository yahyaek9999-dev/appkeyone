import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import ForecastUi from "./forecast-ui";

export const dynamic = "force-dynamic";

export default async function RevenueForecastPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const g = await pageGate("forecasting");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="توقّعات الإيرادات"
          description="توقّع إيراداتك القادمة بناءً على بيانات مبيعاتك الفعلية وخطّط بثقة. متاح في باقة Pro فأعلى."
        />
      </div>
    );
  }
  return <ForecastUi />;
}
