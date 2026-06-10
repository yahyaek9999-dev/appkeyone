import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import FunnelUi from "./funnel-ui";

export const dynamic = "force-dynamic";

export default async function FunnelPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const g = await pageGate("advanced_analytics");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="قمع التحويل"
          description="تتبّع رحلة العميل من أول رسالة حتى الشراء واكتشف أين تخسر العملاء. متاح في باقة Pro فأعلى."
        />
      </div>
    );
  }
  return <FunnelUi />;
}
