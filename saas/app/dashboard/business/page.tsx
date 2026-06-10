import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import BusinessUi from "./business-ui";

export const dynamic = "force-dynamic";

export default async function BusinessPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const g = await pageGate("advanced_reporting");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="تقارير الأعمال التنفيذية"
          description="تقارير تنفيذية شاملة تساعدك على اتخاذ قرارات أذكى وأسرع لنموّ عملك. متاحة في باقة Business فأعلى."
        />
      </div>
    );
  }
  return <BusinessUi />;
}
