import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import IntelUi from "./intel-ui";

export const dynamic = "force-dynamic";

export default async function IntelPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const g = await pageGate("advanced_insights");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="الرؤى المتقدّمة"
          description="رؤى ذكية تكشف الأنماط والفرص والسلوك الشاذّ في تعاملات عملائك. متاحة في باقة Pro فأعلى."
        />
      </div>
    );
  }
  return <IntelUi />;
}
