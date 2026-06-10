// Revenue Copilot — unified opportunity worklist (read-only).
//
// One round-trip that returns the merchant's highest-revenue next actions,
// ranked across all opportunity types, each with a unified Next Best Action,
// confidence, and estimated EGP value. Pure derivation over scores the pipeline
// already wrote — see lib/intelligence/revenue-opportunity.ts.

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";
import { buildRevenueCopilot } from "@/lib/intelligence/revenue-opportunity";
import { buildSelfLearningReport } from "@/lib/intelligence/self-learning";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await apiGate("revenue_attribution");
  if (gate.response) return gate.response;
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const now = new Date();
  const [copilot, learning] = await Promise.all([
    buildRevenueCopilot(uid, { now }),
    buildSelfLearningReport(uid, { now }).catch(() => null),
  ]);

  return NextResponse.json({
    generatedAt: copilot.generatedAt,
    opportunityCount: copilot.opportunityCount,
    totalPipelineValue: copilot.totalPipelineValue,
    highConfidenceValue: copilot.highConfidenceValue,
    tierCounts: copilot.tierCounts,
    opportunities: copilot.opportunities,
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
  });
}
