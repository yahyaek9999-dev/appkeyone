/**
 * Credit-funded broadcast campaigns ("حملات الرصيد").
 *
 * Credits are SEPARATE from the Meta wallet. A merchant buys credits, creates a
 * campaign, and it enters the shared QR slot queue — the scheduler wakes a QR
 * session, promotes the campaign into the existing drain, and settles credits on
 * completion. This page hosts the balance card, buy-credits form, campaign
 * creator, queue status, history, and analytics tiles.
 *
 * Owner-only: gated by the "broadcasts" capability. Renders <LockedFeature> when
 * the plan doesn't include broadcasts.
 */
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import BroadcastsProClient from "./broadcasts-pro-client";

export const dynamic = "force-dynamic";

export default async function BroadcastsProPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const g = await pageGate("broadcast_credits");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="حملات الرصيد"
          description="اشترِ رصيدًا وأرسل حملات واتساب عبر طابور QR الذكي — منفصلة تمامًا عن محفظة Meta. تدخل الحملة الطابور ويُخصم الرصيد عند التنفيذ."
        />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title mb-1">حملات الرصيد</h1>
          <p className="page-desc">
            اشترِ رصيدًا، أنشئ حملة، وتدخل طابور جلسات QR الذكية تلقائيًا. الرصيد منفصل عن محفظة Meta ويُخصم لكل مستلِم.
          </p>
        </div>
      </div>
      <BroadcastsProClient />
    </div>
  );
}
