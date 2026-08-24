// /dashboard/shipments — customer surface for the Phase-2 shipping pipeline.
// The API layer (/api/shipments, /api/shipments/[id]/action), the Shipment model
// and the admin provider config already existed; only this page was missing.
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import ShipmentsUi from "./shipments-ui";

export const dynamic = "force-dynamic";

export default async function ShipmentsPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const g = await pageGate("shipping_tracking");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="الشحن والتتبّع"
          description="أنشئ شحنات لطلباتك، تابع حالتها لحظة بلحظة، وحدّث العميل تلقائياً. متاح في باقة Pro فأعلى."
        />
      </div>
    );
  }
  return <ShipmentsUi />;
}
