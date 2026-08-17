// Smart Monitoring Pro — Monitoring Center (server page).
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import MonitoringUi from "./monitoring-ui";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";

export const dynamic = "force-dynamic";

export default async function MonitoringPage() {
  const gate = await pageGate("monitoring_center");
  if (!gate.uid) redirect("/login");
  if (!gate.allowed) return <LockedFeature title="مركز المراقبة والتنبيهات" description="مراقبة الأداء التجاري في الوقت الفعلي مع تنبيهات ذكية" recommendedTier={gate.recommendedTier} />;
  return <MonitoringUi />;
}
