/**
 * POST /api/brain/analyze — build Brain profiles for THIS workspace's customers.
 *
 * The gap this closes: /dashboard/brain is sold on Enterprise and showed a
 * merchant nothing but zeros, forever. Brain's writer, enrichBrainMemory(), was
 * reachable only from POST /api/brain/memory (one customer at a time, by id — a
 * merchant has no way to call that) and from /api/brain/chat. Nothing in the
 * inbound WhatsApp path calls it, so no conversation ever produced a profile.
 * The page had no button either: zero inputs, zero actions. Credits were
 * allocated (1,000 on the test tenant) and could not be spent.
 *
 * This is the missing trigger, and deliberately NOT a pipeline change: it runs
 * only when the merchant asks, exactly like "فحص الآن" on /dashboard/monitoring
 * and "حساب الإيرادات" on /dashboard/revenue-pro. lib/bot/executor.ts and the
 * inbound route are untouched.
 *
 * Scoping and cost control:
 *   · customers are selected by `userId` — a workspace can only ever analyse
 *     its own, and the id never comes from the request;
 *   · newest-first and capped, so one click cannot fan out unbounded;
 *   · credits are checked before each customer and the run stops cleanly when
 *     they are exhausted, reporting how far it got.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiGate } from "@/lib/membership/gate";
import { enrichBrainMemory } from "@/lib/brain";
import { brainAllowsCall, debitBrainCall, trackBrainUsage } from "@/lib/brain/usage";

export const dynamic = "force-dynamic";

const db = prisma as any;

/** One click must not fan out over an entire customer base. */
const MAX_PER_RUN = 25;

export async function POST() {
  // Same capability the single-customer endpoint enforces.
  const gate = await apiGate("smart_assistant");
  if (gate.response) return gate.response;
  const uid = gate.uid!;

  let customers: { id: string }[] = [];
  try {
    customers = await db.customer.findMany({
      where: { userId: uid },
      select: { id: true },
      orderBy: { lastSeenAt: "desc" },
      take: MAX_PER_RUN,
    });
  } catch (e) {
    console.error("[brain/analyze] customer lookup failed:", e);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  if (customers.length === 0) {
    return NextResponse.json({
      ok: true,
      analyzed: 0,
      failed: 0,
      stoppedForCredits: false,
      reason: "no_customers",
    });
  }

  let analyzed = 0;
  let failed = 0;
  let stoppedForCredits = false;

  for (const c of customers) {
    const allow = await brainAllowsCall(uid).catch(() => ({ allowed: false, balance: 0 }));
    if (!allow.allowed) {
      stoppedForCredits = true;
      break;
    }
    const started = Date.now();
    try {
      const enriched = await enrichBrainMemory(uid, c.id, "");
      const creditsUsed = await debitBrainCall(uid, "memory", `analyze:${c.id}:${started}`);
      await trackBrainUsage({
        userId: uid,
        customerId: c.id,
        channel: "memory",
        insights: enriched.insights.map((i) => i.type),
        dialect: enriched.dialect,
        industry: enriched.industry,
        creditsUsed,
        latencyMs: Date.now() - started,
      }).catch(() => {});
      analyzed++;
    } catch (e) {
      // One bad customer must not abort the whole run.
      console.error("[brain/analyze] enrich failed for customer:", c.id, e);
      failed++;
    }
  }

  return NextResponse.json({ ok: true, analyzed, failed, stoppedForCredits, considered: customers.length });
}
