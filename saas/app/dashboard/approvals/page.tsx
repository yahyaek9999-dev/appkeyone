import { redirect } from "next/navigation";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import ApprovalsUi from "./approvals-ui";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const g = await pageGate("approval_workflows");
  if (!g.uid) redirect("/login");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="مسارات الموافقات"
          description="اطلب موافقة المالك/المدير قبل تنفيذ إجراء حسّاس (بثّ، خصم، استرداد). متاح في باقة Business فأعلى."
        />
      </div>
    );
  }
  return <ApprovalsUi />;
}
