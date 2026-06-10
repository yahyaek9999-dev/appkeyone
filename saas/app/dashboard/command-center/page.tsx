import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import CommandCenterUi from "./command-center-ui";

export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const g = await pageGate("advanced_analytics");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="مركز القيادة"
          description="غرفة عمليات موحّدة تتابع كل مؤشّرات عملك لحظة بلحظة في مكان واحد. متاح في باقة Pro فأعلى."
        />
      </div>
    );
  }
  return <CommandCenterUi />;
}
