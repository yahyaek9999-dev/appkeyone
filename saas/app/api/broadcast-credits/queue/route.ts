/**
 * GET /api/broadcast-credits/queue — this user's QR slot jobs with live queue
 * positions. Backs the "Queue Status" panel on the credit-campaigns dashboard.
 * Owner-only via the "broadcasts" permission + capability gate. Read-only.
 */
import { NextResponse } from "next/server";
import { apiGate } from "@/lib/membership/gate";
import { listQueue, queuePosition } from "@/lib/qr-pool/scheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await apiGate("broadcasts", "broadcasts");
  if (g.response) return g.response;
  const uid = g.uid!;

  const jobs = await listQueue({ userId: uid });
  const items = await Promise.all(
    jobs.map(async (j) => ({
      id: j.id,
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
