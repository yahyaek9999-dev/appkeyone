// Activation Funnel — append-only milestone tracking (lib/activation/track.ts).
//
// WHAT THIS IS: a tiny, fire-and-forget emitter + a derive-on-read sync so we
// can measure the signup→value journey WITHOUT touching the WhatsApp send
// pipeline, queue, or commerce backends (hard rule). Two ways a milestone lands
// in the ActivationEvent ledger:
//
//   1. recordMilestone(userId, milestone)  — called inline from the THREE safe,
//      non-pipeline write points: signup, onboarding/setup, and the WhatsApp
//      status-poll route (a read/sync route, not a send path).
//
//   2. syncUserMilestones(userId) — derives the pipeline-internal milestones
//      (first_ai_reply_sent, first_order_extracted, first_broadcast_sent) by
//      READING existing tables (Message, Order, Broadcast) and records any that
//      are reached but not yet in the ledger. Called on dashboard load. This is
//      how we instrument pipeline events without editing the pipeline.
//
// Idempotency: ActivationEvent has @@unique([userId, milestone]); we create with
// a swallowed unique-conflict, so the first occurrence wins and `at` is the
// real time-to-first-X. Tolerant of a missing Prisma delegate (pre-db-push):
// every function degrades to a no-op instead of throwing — analytics are
// best-effort and must never block a request.

import { prisma } from "@/lib/db";

export type ActivationMilestone =
  | "signed_up"
  | "onboarding_completed"
  | "whatsapp_connected"
  | "first_ai_reply_sent"
  | "first_order_extracted"
  | "first_broadcast_sent";

// Canonical funnel order — the signup→value journey. The admin funnel and the
// dashboard checklist both render in this order.
export const ACTIVATION_FUNNEL: { key: ActivationMilestone; label: string }[] = [
  { key: "signed_up", label: "سجّل حساب" },
  { key: "onboarding_completed", label: "أكمل الإعداد" },
  { key: "whatsapp_connected", label: "ربط واتساب" },
  { key: "first_ai_reply_sent", label: "أول رد آلي" },
  { key: "first_order_extracted", label: "أول طلب" },
  { key: "first_broadcast_sent", label: "أول حملة" },
];

export const ACTIVATION_MILESTONES: ActivationMilestone[] = ACTIVATION_FUNNEL.map((s) => s.key);

function delegate(): any | null {
  const d = (prisma as any).activationEvent;
  return d && typeof d === "object" ? d : null;
}

/**
 * Record that `userId` reached `milestone` — at most once, ever. Fire-and-forget
 * by default (never blocks the caller, never throws). The unique constraint on
 * (userId, milestone) makes repeated calls cheap no-ops.
 *
 * Returns true if a NEW milestone row was created, false otherwise (already
 * recorded, delegate missing, or any error). `await` it only when you need that
 * boolean (e.g. to know whether to fire a one-time UX); the common path is to
 * call without awaiting.
 */
export async function recordMilestone(
  userId: string,
  milestone: ActivationMilestone,
  metadata?: Record<string, unknown>,
): Promise<boolean> {
  if (!userId || userId === "*") return false;
  const d = delegate();
  if (!d) return false;
  try {
    // Fast path: skip the write if it already exists (avoids unique-conflict noise).
    const existing = await d.findUnique({
      where: { userId_milestone: { userId, milestone } },
      select: { id: true },
    });
    if (existing) return false;
    await d.create({
      data: {
        userId,
        milestone,
        metadata: metadata ? safeJson(metadata) : null,
      },
    });
    return true;
  } catch {
    // Unique-conflict (someone else recorded it first) or pre-migration. No-op.
    return false;
  }
}

function safeJson(v: Record<string, unknown>): string | null {
  try {
    return JSON.stringify(v).slice(0, 1000);
  } catch {
    return null;
  }
}

/**
 * Which milestones has this user ALREADY been recorded for? Returns a Set of
 * milestone keys. Safe/no-op (empty Set) when the delegate is missing.
 */
export async function getRecordedMilestones(userId: string): Promise<Set<ActivationMilestone>> {
  const d = delegate();
  if (!d || !userId) return new Set();
  try {
    const rows = await d.findMany({ where: { userId }, select: { milestone: true } });
    return new Set(rows.map((r: { milestone: string }) => r.milestone as ActivationMilestone));
  } catch {
    return new Set();
  }
}

export interface MilestoneStatus {
  reached: Record<ActivationMilestone, boolean>;
  reachedAt: Partial<Record<ActivationMilestone, string>>; // ISO timestamps from the ledger
}

/**
 * DERIVE (read-only) which pipeline-internal milestones a user has reached, by
 * looking at the source tables the pipeline ALREADY writes. This is the bridge
 * that lets us instrument send-pipeline / commerce events without editing them.
 *
 *   - whatsapp_connected     : bot.whatsappStatus === "connected"
 *   - first_ai_reply_sent    : ≥1 Message with role "assistant" for this user
 *   - first_order_extracted  : ≥1 Order for this user
 *   - first_broadcast_sent   : ≥1 Broadcast that has sent ≥1 (status done/sending or sent>0)
 *
 * signed_up / onboarding_completed are NOT derivable from a single signal
 * (they're emitted inline), so they are not returned here.
 */
export async function deriveReachedMilestones(userId: string): Promise<Set<ActivationMilestone>> {
  const reached = new Set<ActivationMilestone>();
  if (!userId) return reached;
  try {
    const [bot, aiReply, order, broadcast] = await Promise.all([
      prisma.bot.findUnique({ where: { userId }, select: { whatsappStatus: true } }),
      prisma.message.findFirst({
        where: { role: "assistant", conversation: { customer: { userId } } },
        select: { id: true },
      }),
      prisma.order.findFirst({ where: { userId }, select: { id: true } }),
      prisma.broadcast.findFirst({
        where: { userId, OR: [{ sent: { gt: 0 } }, { status: { in: ["sending", "done"] } }] },
        select: { id: true },
      }),
    ]);
    if (bot?.whatsappStatus === "connected") reached.add("whatsapp_connected");
    if (aiReply) reached.add("first_ai_reply_sent");
    if (order) reached.add("first_order_extracted");
    if (broadcast) reached.add("first_broadcast_sent");
  } catch {
    /* best-effort */
  }
  return reached;
}

/**
 * Reconcile the ledger with reality: derive reached pipeline milestones and
 * record any that aren't in the ledger yet (idempotent). Returns the full
 * reached-set (ledger ∪ derived) so the caller can render the checklist in one
 * round-trip. Safe to call on every dashboard load — it only writes the gap.
 */
export async function syncUserMilestones(userId: string): Promise<MilestoneStatus> {
  const empty = (): MilestoneStatus => ({
    reached: {
      signed_up: false,
      onboarding_completed: false,
      whatsapp_connected: false,
      first_ai_reply_sent: false,
      first_order_extracted: false,
      first_broadcast_sent: false,
    },
    reachedAt: {},
  });
  if (!userId || userId === "*") return empty();

  const d = delegate();
  // Without the table we can still derive a live (un-persisted) view so the
  // checklist works pre-migration.
  const derived = await deriveReachedMilestones(userId);

  let ledger = new Set<ActivationMilestone>();
  const reachedAt: Partial<Record<ActivationMilestone, string>> = {};
  if (d) {
    try {
      const rows = await d.findMany({ where: { userId }, select: { milestone: true, at: true } });
      for (const r of rows as { milestone: string; at: Date }[]) {
        ledger.add(r.milestone as ActivationMilestone);
        reachedAt[r.milestone as ActivationMilestone] = new Date(r.at).toISOString();
      }
    } catch {
      /* ignore */
    }

    // Record the derived milestones that aren't persisted yet (idempotent).
    const toRecord = [...derived].filter((m) => !ledger.has(m));
    for (const m of toRecord) {
      const created = await recordMilestone(userId, m);
      if (created) {
        ledger.add(m);
        reachedAt[m] = new Date().toISOString();
      }
    }
  }

  const union = new Set<ActivationMilestone>([...ledger, ...derived]);
  const status = empty();
  for (const m of ACTIVATION_MILESTONES) status.reached[m] = union.has(m);
  status.reachedAt = reachedAt;
  return status;
}
