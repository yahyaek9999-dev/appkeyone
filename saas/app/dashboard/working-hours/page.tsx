import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import WorkingHoursUi from "./working-hours-ui";

export const dynamic = "force-dynamic";

export default async function WorkingHoursPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const g = await pageGate("working_hours");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="ساعات العمل"
          description="حدّد ساعات عملك وردودًا تلقائية مهذّبة خارج الدوام حتى لا يضيع أي عميل. متاح في باقة Growth فأعلى."
        />
      </div>
    );
  }
  return <WorkingHoursUi />;
}
