import { redirect } from "next/navigation";
import SystemHealthUi from "./system-health-ui";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";

export const dynamic = "force-dynamic";

export default async function SystemHealthPage() {
  const gate = await pageGate("system_health");
  if (!gate.uid) redirect("/login");
  if (!gate.allowed) return <LockedFeature title="صحة النظام والخدمات" description="مراقبة حالة خدمات المنصة وأداء المزودين" recommendedTier={gate.recommendedTier} />;
  return <SystemHealthUi />;
}
