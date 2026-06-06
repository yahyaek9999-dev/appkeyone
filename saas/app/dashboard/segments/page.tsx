import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import SegmentsUi from "./segments-ui";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";

export const dynamic = "force-dynamic";

export default async function SegmentsPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const g = await pageGate("customer_segmentation");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="تقسيم العملاء (الشرائح)"
          description="قسّم عملاءك حسب السلوك والقيمة والاهتمام لاستهداف أدقّ. متاح في باقة Pro فأعلى."
        />
      </div>
    );
  }
  return <SegmentsUi />;
}
