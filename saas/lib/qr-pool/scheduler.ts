/**
 * lib/qr-pool/scheduler.ts — shared FIFO QR slot queue (Smart QR Pool booking).
 *
 * QrSlotJob is a unit of work (broadcast or import) that must run inside a booked
 * WhatsApp session slot. This module is pure QUEUE MECHANICS — enqueue, atomic
 * claim (FIFO by priority then age), complete/fail, capacity. The dispatch of
 * actual work (waking the session, promoting a broadcast, running an import) is
 * provided by handlers in the cron, so this file never imports the send pipeline.
 *
 * Concurrency: at most `maxConcurrentSlots` jobs are "running" at once, so the
 * existing pool's active-session budget is respected and no session is pinned.
 */

import { prisma } from "@/lib/db";
import { qrPoolFlags } from "./flags";

export type QrJobType = "broadcast" | "import";
export type QrJobStatus = "queued" | "scheduled" | "running" | "done" | "failed" | "canceled";

export interface EnqueueArgs {
  userId: string;
  type: QrJobType;
  refId: string;
  priority?: number;
}

/** Enqueue a job. Idempotent per (type, refId): an existing open job is reused. */
export async function enqueueJob(args: EnqueueArgs) {
  const existing = await prisma.qrSlotJob.findFirst({
    where: { type: args.type, refId: args.refId, status: { in: ["queued", "scheduled", "running"] } },
  });
  if (existing) return existing;
  return prisma.qrSlotJob.create({
    data: { userId: args.userId, type: args.type, refId: args.refId, priority: args.priority || 0 },
  });
}

/** How many slots are currently occupied by running jobs. */
export async function countRunning(): Promise<number> {
  return prisma.qrSlotJob.count({ where: { status: "running" } });
}

/** Free capacity right now (>= 0). */
export async function capacity(): Promise<number> {
  const running = await countRunning();
  return Math.max(0, qrPoolFlags.maxConcurrentSlots - running);
}

/**
 * Atomically claim the next queued job into "running". FIFO: highest priority,
 * then oldest. Returns the claimed job or null. The claim is race-safe: the
 * guarded updateMany flips exactly one row, so two concurrent ticks can't claim
 * the same job.
 */
export async function claimNextJob(workerId: string): Promise<any | null> {
  // Candidate scan (cheap, indexed). Try a few in case of contention.
  const candidates = await prisma.qrSlotJob.findMany({
    where: { status: "queued" },
    orderBy: [{ priority: "desc" }, { queuedAt: "asc" }],
    take: 5,
  });
  for (const c of candidates) {
    const claim = await prisma.qrSlotJob.updateMany({
      where: { id: c.id, status: "queued" },
      data: { status: "running", lockedAt: new Date(), lockedBy: workerId, startedAt: new Date(), attempts: { increment: 1 } },
    });
    if (claim.count === 1) {
      return prisma.qrSlotJob.findUnique({ where: { id: c.id } });
    }
  }
  return null;
}

export async function completeJob(id: string, result?: Record<string, unknown>) {
  return prisma.qrSlotJob.update({
    where: { id },
    data: { status: "done", finishedAt: new Date(), lockedAt: null, lockedBy: null, result: safeJson(result) },
  });
}

export async function failJob(id: string, error: string, opts: { retry?: boolean } = {}) {
  const job = await prisma.qrSlotJob.findUnique({ where: { id } });
  if (!job) return null;
  const canRetry = opts.retry && job.attempts < job.maxAttempts;
  return prisma.qrSlotJob.update({
    where: { id },
    data: canRetry
      ? { status: "queued", lockedAt: null, lockedBy: null, error: error.slice(0, 500) }
      : { status: "failed", finishedAt: new Date(), lockedAt: null, lockedBy: null, error: error.slice(0, 500) },
  });
}

export async function cancelJob(id: string, userId?: string) {
  const where: any = { id };
  if (userId) where.userId = userId;
  const job = await prisma.qrSlotJob.findFirst({ where });
  if (!job || ["done", "failed", "canceled"].includes(job.status)) return job;
  return prisma.qrSlotJob.update({ where: { id: job.id }, data: { status: "canceled", finishedAt: new Date(), lockedAt: null, lockedBy: null } });
}

/** Reclaim jobs stuck "running" past the slot timeout (crash recovery). */
export async function reclaimStuckJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - qrPoolFlags.slotTimeoutMs);
  const stuck = await prisma.qrSlotJob.findMany({ where: { status: "running", startedAt: { lt: cutoff } }, take: 50 });
  let n = 0;
  for (const j of stuck) {
    await failJob(j.id, "slot_timeout", { retry: true });
    n++;
  }
  return n;
}

export async function listQueue(opts: { userId?: string; status?: string; take?: number } = {}) {
  const where: any = {};
  if (opts.userId) where.userId = opts.userId;
  if (opts.status) where.status = opts.status;
  return prisma.qrSlotJob.findMany({
    where,
    orderBy: [{ status: "asc" }, { priority: "desc" }, { queuedAt: "asc" }],
    take: Math.min(opts.take || 100, 500),
  });
}

/** Queue position (1-based) of a queued job among its peers; 0 if not queued. */
export async function queuePosition(jobId: string): Promise<number> {
  const job = await prisma.qrSlotJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "queued") return 0;
  const ahead = await prisma.qrSlotJob.count({
    where: {
      status: "queued",
      OR: [
        { priority: { gt: job.priority } },
        { priority: job.priority, queuedAt: { lt: job.queuedAt } },
      ],
    },
  });
  return ahead + 1;
}

function safeJson(v: unknown): string {
  try { return JSON.stringify(v || {}); } catch { return "{}"; }
}
