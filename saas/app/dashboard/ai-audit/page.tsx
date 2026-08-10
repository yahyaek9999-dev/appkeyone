// AI Agent Auditor — merchant dashboard page (server). Gated on the smart-
// assistant entitlement, same family as the Knowledge Brain.
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import AuditUi from "./audit-ui";

export const dynamic = "force-dynamic";

export default async function AiAuditPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");

  const g = await pageGate("smart_assistant");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="جاهزية المساعد"
          description="يفحص إعداد مساعدك بالكامل — البرومبت، المعرفة، الردود، الكتالوج، ملف النشاط — ويعطيك درجة جاهزية وقائمة إصلاحات. متاح في باقة Pro فأعلى."
        />
      </div>
    );
  }
  return <AuditUi />;
}
