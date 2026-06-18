/**
 * lib/credits/broadcast-handler.ts — QR broadcast slot handler (Phase 4).
 *
 * Bridges QrSlotJob ↔ Broadcast ↔ credits ↔ the Smart QR Pool WITHOUT touching
 * the protected send pipeline:
 *   - start:    wake the session, then promote the campaign from "credit_queued"
 *               → "queued" so the EXISTING broadcast drain cron sends it.
 *   - reconcile: once the campaign is "done"/"canceled", refund the unused
 *               reserved credits (tenant pays only for messages actually sent)
 *               and free the slot. The pool auto-hibernates the idle session.
 *
 * Credit lifecycle: reserve = recipients × perRecipient is DEBITED at creation
 * (campaign), and (reserved − sent × perRecipient) is REFUNDED here on finish.
 */

import { prisma } from "@/lib/db";
import { wa } from "@/lib/wa";
import { refund } from "./credits";
import { creditFlags } from "./flags";
import { completeJob } from "@/lib/qr-pool/scheduler";

export interface HandlerOutcome { running?: boolean; done?: boolean; error?: string }

/** Start a broadcast slot: wake the session and release the campaign to drain. */
export async function startBroadcastJob(job: { id: string; userId: string; refId: string }): Promise<HandlerOutcome> {
  const bc = await prisma.broadcast.findUnique({ where: { id: job.refId } });
  if (!bc) return { done: true, error: "broadcast_not_found" };
  if (bc.status === "done" || bc.status === "canceled") return { done: true };

  // Book the QR slot by waking the session (best-effort — the drain handles
  // a not-yet-ready session via its own retry/pacing).
  await wa.wake(job.userId).catch(() => {});

  // Promote into the existing drain ONLY if still parked. Setting scheduledAt=now
  // + status "queued" makes the untouched cron pick it up immediately.
  if (bc.status === "credit_queued") {
    await prisma.broadcast.update({
      where: { id: bc.id },
      data: { status: "queued", scheduledAt: new Date(), startedAt: bc.startedAt || new Date() },
    });
  }
  return { running: true };
}

/** Reconcile a running broadcast slot; settle credits + free slot when finished. */
export async function reconcileBroadcastJob(job: { id: string; userId: string; refId: string }): Promise<HandlerOutcome> {
  const bc = await prisma.broadcast.findUnique({ where: { id: job.refId } });
  if (!bc) { await completeJob(job.id, { error: "broadcast_not_found" }); return { done: true }; }

  if (bc.status !== "done" && bc.status !== "canceled") {
    return { running: true }; // still draining — keep the slot
  }

  // Settle: refund the portion of the reservation not actually sent.
  const per = Math.max(1, creditFlags.perRecipient);
  const charged = Math.max(0, bc.sent) * per;
  const reserved = Math.max(0, bc.creditsReserved);
  const toRefund = Math.max(0, reserved - charged);
  let refunded = 0;
  if (toRefund > 0) {
    const res = await refund({
      userId: job.userId, amount: toRefund, refId: bc.id,
      reason: `unsent_refund:${bc.failed} failed/${bc.total} total`,
      idempotencyKey: `campaign-refund:${bc.id}`,
    });
    if (res.ok) refunded = toRefund;
  }
  await completeJob(job.id, { broadcastId: bc.id, sent: bc.sent, failed: bc.failed, total: bc.total, charged, refunded });
  return { done: true };
}
