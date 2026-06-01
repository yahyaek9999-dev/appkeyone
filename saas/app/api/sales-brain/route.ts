// Sales Brain — command center read endpoint.
//
// One round-trip that powers the Sales Brain dashboard:
//   • Revenue Intelligence (new, lib/sales-brain/revenue.ts)
//   • Recommendation of the day + top insights (REUSED from lib/daily-report,
//     the same heuristic engine that builds the WhatsApp daily report — zero
//     extra LLM tokens).
//
// All work is read-only and bounded. The four lead/lost/upsell detectors keep
// living on /api/intel; this page links there instead of duplicating them.

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { revenueIntelligence } from "@/lib/sales-brain/revenue";
import { aggregateForUser } from "@/lib/daily-report/aggregate";
import { deriveInsights, topN, recommend } from "@/lib/daily-report/insights";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const now = new Date();
  const [revenue, agg] = await Promise.all([
    revenueIntelligence(uid, now),
    aggregateForUser(uid, now),
  ]);

  const insights = deriveInsights(agg);
  const top = topN(insights, 3);
  const recommendation = recommend(top);

  return NextResponse.json({
    generatedAt: now.toISOString(),
    revenue,
    insights: top.map((i) => ({ id: i.id, text: i.text })),
    recommendation,
    // headline signals reused from the daily-report aggregate
    signals: {
      hotLeads: agg.hotLeads,
      hotLeadsAwaiting: agg.hotLeadsAwaiting,
      newCustomers: agg.newCustomers,
      ordersCount: agg.ordersCount,
      unresolvedEscalations: agg.unresolvedEscalations,
    },
  });
}
