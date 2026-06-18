/**
 * Admin QR slot queue control (broadcast-credit ops).
 *   GET  /api/admin/broadcast-credits/queue — full queue, enriched with the
 *        owning user's email + live position.
 *   POST /api/admin/broadcast-credits/queue — { action, jobId }:
 *        "force_stop"  → cancelJob (cancels a queued/running job)
 *        "force_start" → bump priority high so the scheduler claims it next.
 * Admin-only; audited. Does NOT touch the send pipeline — pure queue mechanics.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";
import { listQueue, queuePosition, cancelJob } from "@/lib/qr-pool/scheduler";

export const dynamic = "force-dynamic";

const FORCE_PRIORITY = 1000;

export async function GET(req: Request) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;

  const jobs = await listQueue({ status, take: 500 });
  const userIds = Array.from(new Set(jobs.map((j) => j.userId)));
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));

  const items = await Promise.all(
    jobs.map(async (j) => ({
      id: j.id,
      userId: j.userId,
      user: byId.get(j.userId) || null,
      type: j.type,
      refId: j.refId,
      status: j.status,
      priority: j.priority,
      attempts: j.attempts,
      error: j.error,
      position: j.status === "queued" ? await queuePosition(j.id) : 0,
      queuedAt: j.queuedAt,
      startedAt: j.startedAt,
      finishedAt: j.finishedAt,
    })),
  );

  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = String(body.action || "");
  const jobId = String(body.jobId || "");
  if (!["force_stop", "force_start"].includes(action) || !jobId) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const adminEmail = admin?.email || "admin";
  const adminId = admin?.id || null;

  try {
    if (action === "force_stop") {
      const job = await cancelJob(jobId);
      if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
      await audit({
        userId: job.userId, action: "broadcast_credit.queue_force_stop",
        actorId: adminId, actorEmail: adminEmail, actorRole: "admin",
        targetType: "qr_slot_job", targetId: jobId, metadata: { status: job.status }, req,
      });
      return NextResponse.json({ ok: true, status: job.status });
    }

    // force_start: bump priority so claimNextJob picks it first. Only meaningful
    // while the job is still queued; the scheduler still respects slot capacity.
    const existing = await prisma.qrSlotJob.findUnique({ where: { id: jobId } });
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const updated = await prisma.qrSlotJob.update({
      where: { id: jobId },
      data: { priority: FORCE_PRIORITY },
    });
    await audit({
      userId: updated.userId, action: "broadcast_credit.queue_force_start",
      actorId: adminId, actorEmail: adminEmail, actorRole: "admin",
      targetType: "qr_slot_job", targetId: jobId, metadata: { priority: FORCE_PRIORITY }, req,
    });
    return NextResponse.json({ ok: true, priority: updated.priority, position: await queuePosition(jobId) });
  } catch (e: any) {
    return NextResponse.json({ error: "action_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
