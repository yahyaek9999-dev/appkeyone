import { redirect } from "next/navigation";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import BranchesUi from "./branches-ui";

export const dynamic = "force-dynamic";

export default async function BranchesPage() {
  const g = await pageGate("multi_branch");
  if (!g.uid) redirect("/login");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="إدارة الفروع المتعدّدة"
          description="أضِف فروعك ووجّه المحادثات والطلبات والتقارير لكل فرع. متاح في باقة Business فأعلى."
        />
      </div>
    );
  }
  return <BranchesUi />;
}
