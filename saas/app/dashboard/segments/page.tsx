import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import SegmentsUi from "./segments-ui";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";

export const dynamic = "force-dynamic";

export default async function SegmentsPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  // Gate on `segments` (tier 1 / Growth) — the capability this page actually
  // sells. It previously gated on `customer_segmentation` (tier 2 / Pro),
  // which locked Growth customers out of a feature their plan includes.
  const g = await pageGate("segments");
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
