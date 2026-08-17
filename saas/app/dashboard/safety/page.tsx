import { redirect } from "next/navigation";
import SafetyDashboard from "./safety-ui";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";

export const dynamic = "force-dynamic";

export default async function SafetyPage() {
  const gate = await pageGate("safety_controls");
  if (!gate.uid) redirect("/login");
  if (!gate.allowed) return <LockedFeature title="لوحة السلامة وتحكّم الحماية" description="مراقبة معدّلات الإرسال ومفاتيح الإيقاف الطارئ لحماية الحساب" recommendedTier={gate.recommendedTier} />;
  return <SafetyDashboard />;
}
