import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import SuggestionsUi from "./suggestions-ui";

export const dynamic = "force-dynamic";

export default async function SuggestionsPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const g = await pageGate("smart_assistant");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="الاقتراحات الذكية"
          description="اقتراحات مدعومة بالذكاء الاصطناعي لتحسين ردودك ورفع تحويلاتك. متاحة في باقة Pro فأعلى."
        />
      </div>
    );
  }
  return <SuggestionsUi />;
}
