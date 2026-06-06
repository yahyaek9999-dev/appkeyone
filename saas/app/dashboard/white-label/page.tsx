import { redirect } from "next/navigation";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import WhiteLabelUi from "./white-label-ui";

export const dynamic = "force-dynamic";

export default async function WhiteLabelPage() {
  const g = await pageGate("white_label");
  if (!g.uid) redirect("/login");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="العلامة البيضاء (White Label)"
          description="اعرض المنصة بعلامتك التجارية: شعارك، ألوانك، نطاقك. متاح في باقة Enterprise."
        />
      </div>
    );
  }
  return <WhiteLabelUi />;
}
