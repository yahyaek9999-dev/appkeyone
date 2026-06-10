import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import SalesBrainUi from "./sales-brain-ui";

export const dynamic = "force-dynamic";

export default async function SalesBrainPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const g = await pageGate("sales_pipeline");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="عقل المبيعات"
          description="ذكاء مبيعات يكشف الفرص ويرتّب أولوياتك ليساعدك على إغلاق صفقات أكثر. متاح في باقة Pro فأعلى."
        />
      </div>
    );
  }
  return <SalesBrainUi />;
}
