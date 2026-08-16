import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import RevenueCopilotUi from "./revenue-copilot-ui";

export const dynamic = "force-dynamic";

export default async function RevenueCopilotPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const g = await pageGate("revenue_copilot");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="مساعد الإيرادات"
          description="قائمة عمل ذكية بأعلى الفرص لزيادة إيرادك اليوم، مرتّبة حسب الأولوية. متاح في باقة Pro فأعلى."
        />
      </div>
    );
  }
  return <RevenueCopilotUi />;
}
