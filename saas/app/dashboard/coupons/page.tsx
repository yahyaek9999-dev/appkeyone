import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import CouponsUi from "./coupons-ui";

export const dynamic = "force-dynamic";

export default async function CouponsPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const g = await pageGate("smart_campaign_builder");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="الكوبونات والعروض"
          description="أنشئ كوبونات خصم وعروضًا ذكية لرفع تكرار الشراء وقيمة الطلب. متاح في باقة Pro فأعلى."
        />
      </div>
    );
  }
  return <CouponsUi />;
}
