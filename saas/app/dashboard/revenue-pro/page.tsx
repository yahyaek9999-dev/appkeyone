// Revenue Assistant Pro — revenue intelligence (server page).
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import RevenueProUi from "./revenue-pro-ui";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";

export const dynamic = "force-dynamic";

export default async function RevenueProPage() {
  const gate = await pageGate("revenue_pro");
  if (!gate.uid) redirect("/login");
  if (!gate.allowed) return <LockedFeature title="تحليلات الإيرادات المتقدّمة" description="قيمة العميل مدى الحياة، تحليل المجموعات، ومعدّلات الاحتفاظ" recommendedTier={gate.recommendedTier} />;
  return <RevenueProUi />;
}
