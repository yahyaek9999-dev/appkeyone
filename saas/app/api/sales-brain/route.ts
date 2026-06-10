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
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { apiGate } from "@/lib/membership/gate";
import { revenueIntelligence } from "@/lib/sales-brain/revenue";
import { aggregateForUser } from "@/lib/daily-report/aggregate";
import { deriveInsights, topN, recommend } from "@/lib/daily-report/insights";
import { buildSelfLearningReport } from "@/lib/intelligence/self-learning";
import { getObjectionOutcomeInsights } from "@/lib/intelligence/memory-graph";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await apiGate("sales_pipeline");
  if (gate.response) return gate.response;
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const limited = enforceRateLimit(req, { name: "sales-brain", identifier: uid, ...RATE_LIMITS.api });
  if (limited) return limited;

  const now = new Date();
  const [revenue, agg, learning, memoryGraph] = await Promise.all([
    revenueIntelligence(uid, now),
    aggregateForUser(uid, now),
    // Self-learning summary (read-only). Fail-closed → panel just hides.
    buildSelfLearningReport(uid, { now }).catch(() => null),
    // Memory-graph objection↔outcome insights (read-only). Fail-closed.
    getObjectionOutcomeInsights(uid).catch(() => null),
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
    // Self-learning panel (Agent 1 — Task 1). Mirrors the Revenue Copilot card.
    learning: learning
      ? {
          windowDays: learning.windowDays,
          totalSent: learning.totalSent,
          overallReplyRate: learning.overallReplyRate,
          overallConversionRate: learning.overallConversionRate,
          totalRevenue: learning.totalRevenue,
          bestKind: learning.bestKind,
          worstKind: learning.worstKind,
          sampleConfidence: learning.sampleConfidence,
          byKind: learning.byKind,
        }
      : null,
    // Memory-graph insight (Agent 1 — Task 3). One merchant-facing line, e.g.
    // "اعتراض الشحن يسبق 60% من الصفقات الضائعة".
    memoryGraphInsights: memoryGraph?.insights || [],
  });
}
