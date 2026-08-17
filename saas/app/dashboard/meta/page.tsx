import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import MetaCenterUi from "./meta-center-ui";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";

export const dynamic = "force-dynamic";

export default async function CustomerMetaPage() {
  const gate = await pageGate("meta_cloud");
  if (!gate.uid) redirect("/login");
  if (!gate.allowed) return <LockedFeature title="مركز Meta والفوترة" description="إدارة اتصال Meta Cloud الرسمي وتتبّع التكاليف" recommendedTier={gate.recommendedTier} />;
  const userId = gate.uid;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">مركز Meta والفوترة</h1>
        <p className="text-sm text-slate-400 max-w-xl">
          حالة اتصالك بواتساب الرسمي (Meta)، استهلاك المحادثات وتكلفتها، رصيدك، وفواتيرك الشهرية —
          كل شيء في مكان واحد.
        </p>
      </div>
      <MetaCenterUi />
    </div>
  );
}
