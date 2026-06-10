import { requirePagePermission } from "@/lib/auth";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import BroadcastsUi from "./broadcasts-ui";

export const dynamic = "force-dynamic";

export default async function BroadcastsPage() {
  await requirePagePermission("broadcasts");
  const g = await pageGate("broadcasts");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="حملات البثّ الجماعي"
          description="أرسل حملات واتساب جماعية لمئات العملاء بضغطة واحدة وتابع نتائجها. متاحة في باقة Growth فأعلى."
        />
      </div>
    );
  }
  return <BroadcastsUi />;
}
