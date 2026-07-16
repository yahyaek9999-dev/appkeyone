// GET /api/admin/ai-control?window=today|week|month  (AI Control Center)
//
// Real, platform-wide AI metrics aggregated from data the system already
// collects — ProviderUsage (calls/tokens/latency/failures per provider/day),
// getTenantCosts (priced cost + per-tenant rows), Document/KnowledgeGap (brain),
// EscalationTicket/Message (response quality). No fabricated values.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { getTenantCosts } from "@/lib/observability/tenant-costs";

export const dynamic = "force-dynamic";

const KNOWN_PROVIDERS = ["keyone", "openai", "claude", "gemini", "groq", "openrouter"];

function sinceDayKey(days: number, now: Date): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

function healthFor(successPct: number | null, calls: number): "green" | "yellow" | "red" | "idle" {
  if (calls === 0) return "idle";
  if (successPct === null) return "idle";
  if (successPct >= 98) return "green";
  if (successPct >= 90) return "yellow";
  return "red";
}

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const win = new URL(req.url).searchParams.get("window") || "month";
  const days = win === "today" ? 1 : win === "week" ? 7 : 30;
  const now = new Date();
  const sinceDay = sinceDayKey(days, now);
  const todayKey = now.toISOString().slice(0, 10);

  const [
    windowRows,
    todayRows,
    cost,
    docs,
    gaps,
    conflicts,
    kbUsers,
    totalTickets,
    openTickets,
    convCount,
    conf,
  ] = await Promise.all([
    (prisma as any).providerUsage
      .groupBy({
        by: ["provider"],
        where: { day: { gte: sinceDay } },
        _sum: {
          calls: true,
          failures: true,
          inputTokens: true,
          outputTokens: true,
          totalLatencyMs: true,
        },
      })
      .catch(() => []),
    (prisma as any).providerUsage
      .groupBy({ by: ["provider"], where: { day: todayKey }, _sum: { calls: true } })
      .catch(() => []),
    getTenantCosts({ days, now }).catch(() => null),
    prisma.document.count().catch(() => 0),
    (prisma as any).knowledgeGap.count().catch(() => 0),
    (prisma as any).knowledgeConflict.count({ where: { resolved: false } }).catch(() => 0),
    prisma.document
      .groupBy({ by: ["userId"], _count: true })
      .then((r: any[]) => r.length)
      .catch(() => 0),
    (prisma as any).escalationTicket.count().catch(() => 0),
    (prisma as any).escalationTicket
      .count({ where: { status: { in: ["open", "escalation_pending", "human_required"] } } })
      .catch(() => 0),
    prisma.conversation.count().catch(() => 0),
    (prisma as any).message
      .aggregate({ _avg: { confidenceScore: true } })
      .catch(() => ({ _avg: { confidenceScore: null } })),
  ]);

  const todayByProvider = new Map<string, number>();
  for (const r of todayRows as any[]) todayByProvider.set(r.provider, r._sum.calls || 0);

  const seen = new Set<string>();
  const providers = (windowRows as any[]).map((r) => {
    seen.add(r.provider);
    const calls = r._sum.calls || 0;
    const failures = r._sum.failures || 0;
    const successPct = calls > 0 ? Math.round(((calls - failures) / calls) * 100) : null;
    return {
      provider: r.provider,
      callsWindow: calls,
      callsToday: todayByProvider.get(r.provider) || 0,
      failures,
      successPct,
      errorPct: successPct === null ? null : 100 - successPct,
      avgLatencyMs: calls > 0 ? Math.round((r._sum.totalLatencyMs || 0) / calls) : 0,
      inputTokens: r._sum.inputTokens || 0,
      outputTokens: r._sum.outputTokens || 0,
      status: healthFor(successPct, calls),
    };
  });
  // Always surface the canonical providers even with no traffic (idle).
  for (const p of KNOWN_PROVIDERS) {
    if (!seen.has(p))
      providers.push({
        provider: p,
        callsWindow: 0,
        callsToday: todayByProvider.get(p) || 0,
        failures: 0,
        successPct: null,
        errorPct: null,
        avgLatencyMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        status: "idle" as const,
      });
  }
  providers.sort((a, b) => b.callsWindow - a.callsWindow);

  const escalationRatePct = convCount > 0 ? Math.round((totalTickets / convCount) * 100) : 0;

  return NextResponse.json({
    ok: true,
    window: win,
    days,
    generatedAt: now.toISOString(),
    providers,
    cost: cost
      ? {
          estUsd: cost.totals.estUsd,
          pricesConfigured: cost.pricesConfigured,
          llmCalls: cost.totals.llmCalls,
          llmFailures: cost.totals.llmFailures,
          inputTokens: cost.totals.inputTokens,
          outputTokens: cost.totals.outputTokens,
          totalTokens: cost.totals.totalTokens,
          avgLatencyMs: cost.totals.avgLatencyMs,
          merchants: cost.totals.merchants,
          topCustomers: (cost.rows || []).slice(0, 10).map((row: any) => ({
            userId: row.userId,
            email: row.email,
            name: row.name,
            llmCalls: row.llmCalls,
            totalTokens: row.totalTokens,
            estUsd: row.estUsd,
          })),
        }
      : null,
    brain: {
      documents: docs,
      knowledgeGaps: gaps,
      knowledgeConflicts: conflicts,
      merchantsWithKb: kbUsers,
    },
    quality: {
      escalationTickets: totalTickets,
      openTickets,
      conversations: convCount,
      escalationRatePct,
      avgConfidence:
        conf?._avg?.confidenceScore != null ? Math.round(conf._avg.confidenceScore) : null,
    },
  });
}
