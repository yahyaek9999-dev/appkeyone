import { NextResponse } from "next/server";
import { drainOutgoingQueue, getOutgoingQueueHealth } from "@/lib/messaging/outgoing-queue";
import { checkInternalSecret } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Phase A — durable outgoing WhatsApp queue drain.
 *
 * This route is intentionally small and cron-friendly:
 * - requires x-internal-secret
 * - drains a bounded batch
 * - respects SafetyState cooldown/kill switch in the queue helper
 * - never loops forever
 */
export async function POST(req: Request) {
  if (!checkInternalSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const batchSize = Number(url.searchParams.get("batchSize") || 20);
  const perUserLimit = Number(url.searchParams.get("perUserLimit") || 6);

  const before = await getOutgoingQueueHealth().catch(() => null);
  const result = await drainOutgoingQueue({ batchSize, perUserLimit });
  const after = await getOutgoingQueueHealth().catch(() => null);

  return NextResponse.json({
    ok: true,
    before,
    result,
    after,
    timestamp: new Date().toISOString(),
  });
}

export async function GET(req: Request) {
  if (!checkInternalSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const health = await getOutgoingQueueHealth();
  return NextResponse.json({ ok: true, health, timestamp: new Date().toISOString() });
}
