// Activation Funnel — global drop-off computation for the admin view.
//
// Read-only and bounded. Counts DISTINCT merchants who reached each milestone,
// derived from source-of-truth tables so the funnel is accurate for every
// account (including those that signed up before the ledger existed) WITHOUT
// touching any send pipeline. The ActivationEvent ledger is unioned in for the
// two inline-emitted milestones so "ever reached" is honoured even if the
// current state has since changed (e.g. WhatsApp later disconnected).
//
// Distinct-user counts use raw SQL (one bounded aggregate row each), mirroring
// the cross-DB pattern in lib/analytics/funnel.ts ("Order" is quoted because it
// is a reserved word; the Customer/Conversation/Message/Document/Broadcast
// table names are unquoted, which works on both SQLite and PostgreSQL).

import { prisma } from "@/lib/db";
import { ACTIVATION_FUNNEL, type ActivationMilestone } from "./track";

export interface ActivationFunnelStage {
  key: ActivationMilestone;
  label: string;
  count: number;
  conversionFromPrev: number | null; // % of previous stage that reached this one
  dropOffFromPrev: number | null; // 100 - conversion
}

export interface ActivationFunnelResult {
  generatedAt: string;
  totalSignups: number;
  stages: ActivationFunnelStage[];
  biggestDropOff: { fromLabel: string; toLabel: string; dropOffPct: number } | null;
  activationRatePct: number; // reached first value (first_ai_reply_sent) / signups
}

async function distinctCount(sql: string): Promise<number> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ n: number | bigint }[]>(sql);
    const n = rows?.[0]?.n;
    return n == null ? 0 : Number(n);
  } catch {
    return 0;
  }
}

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.round((n / d) * 1000) / 10;
}

export async function getActivationFunnel(): Promise<ActivationFunnelResult> {
  const ledgerDelegate = (prisma as any).activationEvent;

  const [
    totalSignups,
    onboardedUsers,
    connectedNow,
    aiReplyUsers,
    orderUsers,
    broadcastUsers,
    ledgerRows,
  ] = await Promise.all([
    prisma.user.count().catch(() => 0),
    distinctCount("SELECT COUNT(DISTINCT userId) AS n FROM Document"),
    prisma.bot.count({ where: { whatsappStatus: "connected" } }).catch(() => 0),
    distinctCount(
      `SELECT COUNT(DISTINCT cu.userId) AS n
       FROM Message m
       JOIN Conversation c ON c.id = m.conversationId
       JOIN Customer cu ON cu.id = c.customerId
       WHERE m.role = 'assistant'`,
    ),
    distinctCount('SELECT COUNT(DISTINCT userId) AS n FROM "Order"'),
    distinctCount(
      "SELECT COUNT(DISTINCT userId) AS n FROM Broadcast WHERE sent > 0 OR status IN ('sending','done')",
    ),
    ledgerDelegate
      ? ledgerDelegate
          .groupBy({ by: ["milestone"], _count: { _all: true } })
          .catch(() => [] as { milestone: string; _count: { _all: number } }[])
      : Promise.resolve([] as { milestone: string; _count: { _all: number } }[]),
  ]);

  // Ledger counts (ever-reached), keyed by milestone.
  const ledger = new Map<string, number>();
  for (const r of ledgerRows as { milestone: string; _count: { _all: number } }[]) {
    ledger.set(r.milestone, r._count._all);
  }
  const ledgerOf = (m: ActivationMilestone) => ledger.get(m) || 0;

  // Final per-milestone counts: derive ∪ ledger so we never undercount.
  const counts: Record<ActivationMilestone, number> = {
    signed_up: Math.max(totalSignups, ledgerOf("signed_up")),
    onboarding_completed: Math.max(onboardedUsers, ledgerOf("onboarding_completed")),
    whatsapp_connected: Math.max(connectedNow, ledgerOf("whatsapp_connected")),
    first_ai_reply_sent: Math.max(aiReplyUsers, ledgerOf("first_ai_reply_sent")),
    first_order_extracted: Math.max(orderUsers, ledgerOf("first_order_extracted")),
    first_broadcast_sent: Math.max(broadcastUsers, ledgerOf("first_broadcast_sent")),
  };

  const stages: ActivationFunnelStage[] = ACTIVATION_FUNNEL.map((s, i) => {
    const count = counts[s.key];
    if (i === 0) return { ...s, count, conversionFromPrev: null, dropOffFromPrev: null };
    const prev = counts[ACTIVATION_FUNNEL[i - 1].key];
    const conv = pct(count, prev);
    return { ...s, count, conversionFromPrev: conv, dropOffFromPrev: Math.round((100 - conv) * 10) / 10 };
  });

  // Biggest drop-off (only between stages whose previous count is non-zero).
  let biggestDropOff: ActivationFunnelResult["biggestDropOff"] = null;
  for (let i = 1; i < stages.length; i++) {
    const prevCount = counts[ACTIVATION_FUNNEL[i - 1].key];
    if (prevCount <= 0) continue;
    const d = stages[i].dropOffFromPrev ?? 0;
    if (!biggestDropOff || d > biggestDropOff.dropOffPct) {
      biggestDropOff = {
        fromLabel: stages[i - 1].label,
        toLabel: stages[i].label,
        dropOffPct: d,
      };
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    totalSignups: counts.signed_up,
    stages,
    biggestDropOff,
    activationRatePct: pct(counts.first_ai_reply_sent, counts.signed_up),
  };
}
