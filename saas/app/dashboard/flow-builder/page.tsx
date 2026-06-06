import { redirect } from "next/navigation";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import FlowBuilderUi from "./flow-builder-ui";

export const dynamic = "force-dynamic";

export default async function FlowBuilderPage() {
  const g = await pageGate("flow_builder");
  if (!g.uid) redirect("/login");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="منشئ المسارات (Flow Builder)"
          description="صمّم رحلات أتمتة مرئية: شرط ← إجراء ← رسالة. متاح في باقة Business فأعلى."
        />
      </div>
    );
  }
  return <FlowBuilderUi />;
}
