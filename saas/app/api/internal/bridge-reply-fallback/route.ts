// Internal: durable fallback for a Bridge AI reply whose live-socket push
// failed at the gateway.
//
// Context (2026-07-23 production incident): for bridge-mode tenants the AI
// reply is pushed synchronously over the Bridge WebSocket. Reply generation
// takes 10-50s (LLM latency), and if the socket died in the meantime (reconnect
// blip, dual-instance eviction war) the reply was dropped forever — it existed
// in the Dashboard conversation but the customer never received it, with only a
// send_failed safety event as a trace.
//
// This endpoint lets the gateway hand that reply to the EXISTING outgoing
// queue (lib/messaging/outgoing-queue — called, not modified), which already
// owns retry/backoff/idempotency and routes bridge tenants back through the
// gateway on each drain tick. Localhost + x-internal-secret only, same guard as
// every cron/internal route.
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { checkInternalSecret } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkInternalSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const userId = String(body?.userId || "").slice(0, 64);
  const to = String(body?.to || "").slice(0, 80);
  const text = String(body?.text || "").slice(0, 4000);
  const conversationId = body?.conversationId
    ? String(body.conversationId).slice(0, 64)
    : null;
  if (!userId || !to || !text) {
    return NextResponse.json({ error: "userId, to, text required" }, { status: 400 });
  }

  const { enqueueOutboundText, drainOutgoingQueue } = await import(
    "@/lib/messaging/outgoing-queue"
  );
  // Same 5-minute-bucket dedup scheme as lib/wa.ts deriveIdempotencyKey: the
  // gateway may retry the fallback for the same reply; only one row may result.
  const bucket = Math.floor(Date.now() / (5 * 60_000));
  const idempotencyKey = createHash("sha256")
    .update(`bridge-reply:${userId}:${to}:${bucket}:${text}`)
    .digest("hex");
  const queued = await enqueueOutboundText({
    userId,
    to,
    text,
    conversationId,
    reason: "system",
    idempotencyKey,
  });
  if (queued.queued) {
    // Opportunistic user-scoped drain — same pattern the `connected` event
    // handler uses. If the bridge socket is healthy again, the reply leaves in
    // seconds; otherwise the queue's normal retry/backoff takes over.
    drainOutgoingQueue({ userId, batchSize: 3, perUserLimit: 2 }).catch(() => {});
  }
  return NextResponse.json({
    ok: queued.queued,
    id: queued.id || null,
    reason: queued.reason || null,
  });
}
