// AI Agent Auditor — merchant dashboard page (server). Gated on the smart-
// assistant entitlement, same family as the Knowledge Brain.
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import AuditUi from "./audit-ui";

export const dynamic = "force-dynamic";

export default async function AiAuditPage() {
  // pageGate handles auth internally and returns allowed=false (not a throw)
  // when unauthenticated — the layout already redirects to /login before we
  // reach here, so g.uid will always be set for a real authenticated request.
  const g = await pageGate("smart_assistant");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="مدقّق الذكاء الاصطناعي"
          description="يفحص إعداد مساعدك بالكامل — البرومبت، المعرفة، الردود، الكتالوج، ملف النشاط — ويعطيك درجة جاهزية وقائمة إصلاحات. متاح في باقة Pro فأعلى."
        />
      </div>
    );
  }
  return <AuditUi />;
}
