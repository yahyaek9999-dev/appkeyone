// ---------------------------------------------------------------------------
// GET /api/internal/wa-health — WhatsApp + queue health aggregation
// (Reliability Phase / Agent 3)
//
// INTERNAL endpoint — requires the `x-internal-secret` header.
//
// One pane of glass for WhatsApp delivery reliability. Aggregates, read-only:
//   1. whatsapp-service session pool stats (connected / disconnected / reconnect
//      timers / health failures / memory) via GET /sessions/stats.
//   2. Outgoing message queue health (queued / sending / stale / failed24h).
//   3. Broadcast queue depth (queued / sending).
//   4. Per-bot Meta Cloud quality ratings + messaging limits (YELLOW/RED count).
//
// Every section catches its own error and degrades to a `null`/error field —
// this endpoint NEVER throws and ALWAYS returns HTTP 200. Monitors read the
// `status` summary field, not the HTTP code.
//
// This does NOT touch the send pipeline, queue behaviour, billing, or
// subscriptions — it only reads existing state.
// ---------------------------------------------------------------------------
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { prisma } from "@/lib/db";
import { checkInternalSecret } from "@/lib/internal-auth";

const SECRET = process.env.SAAS_INTERNAL_SECRET ?? "";
const WA_BASE = process.env.WHATSAPP_SERVICE_URL || "http://127.0.0.1:3001";

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

// ---- whatsapp-service pool stats ------------------------------------------
async function getServiceStats(): Promise<
  | { reachable: true; latencyMs: number; stats: Record<string, unknown> }
  | { reachable: false; reason: string }
> {
  try {
    const t0 = Date.now();
    const res = await fetch(`${WA_BASE}/sessions/stats`, {
      headers: { "x-internal-secret": SECRET },
      signal: AbortSignal.timeout(4_000),
      cache: "no-store",
    });
    const latencyMs = Date.now() - t0;
    if (!res.ok) return { reachable: false, reason: `http_${res.status}` };
    const stats = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { reachable: true, latencyMs, stats };
  } catch (err: unknown) {
    return {
      reachable: false,
      reason: (err as Error)?.message?.slice(0, 80) ?? "fetch_error",
    };
  }
}

// ---- outgoing + broadcast queue depth -------------------------------------
async function getQueueDepth() {
  const { getOutgoingQueueHealth } = await import(
    "@/lib/messaging/outgoing-queue"
  );
  const [outgoing, broadcastQueued, broadcastSending] = await Promise.all([
    getOutgoingQueueHealth().catch(() => null),
    prisma.broadcast.count({ where: { status: "queued" } }).catch(() => -1),
    prisma.broadcast.count({ where: { status: "sending" } }).catch(() => -1),
  ]);
  return { outgoing, broadcastQueued, broadcastSending };
}

// ---- Meta Cloud quality roll-up -------------------------------------------
// Reads cached Bot.metaQualityRating (kept fresh by the meta-quality-monitor
// cron). No Graph API calls here — this stays fast and rate-limit-safe.
async function getMetaQuality() {
  try {
    const bots = await prisma.bot.findMany({
      where: { metaPhoneNumberId: { not: null } } as any,
      select: {
        userId: true,
        metaQualityRating: true,
        metaMessagingLimit: true,
        metaVerifiedAt: true,
      } as any,
    });
    let green = 0;
    let yellow = 0;
    let red = 0;
    let unknown = 0;
    for (const b of bots as any[]) {
      switch ((b.metaQualityRating || "").toUpperCase()) {
        case "GREEN":
          green++;
          break;
        case "YELLOW":
          yellow++;
          break;
        case "RED":
          red++;
          break;
        default:
          unknown++;
      }
    }
    return {
      configured: bots.length,
      green,
      yellow,
      red,
      unknown,
      // Surface the at-risk numbers explicitly for alerting thresholds.
      atRisk: yellow + red,
    };
  } catch (err: unknown) {
    return { error: String((err as Error)?.message ?? err).slice(0, 120) };
  }
}

export async function GET(req: Request) {
  if (!checkInternalSecret(req)) {
    return unauthorized();
  }

  const [service, queues, meta] = await Promise.all([
    getServiceStats(),
    getQueueDepth().catch(() => null),
    getMetaQuality(),
  ]);

  // ---- Derive a single summary verdict for cheap alerting -------------------
  // ok       — service reachable, queue not stale, no RED quality
  // degraded — service unreachable OR queue aging OR YELLOW/RED quality present
  let status: "ok" | "degraded" = "ok";
  const reasons: string[] = [];

  if (!service.reachable) {
    status = "degraded";
    reasons.push(`wa_service_${service.reason}`);
  }
  if (queues?.outgoing && (queues.outgoing.staleQueued ?? 0) > 0) {
    status = "degraded";
    reasons.push("outgoing_queue_stale");
  }
  if ("atRisk" in meta && (meta as any).atRisk > 0) {
    status = "degraded";
    reasons.push("meta_quality_at_risk");
  }

  return Response.json(
    {
      status,
      reasons,
      service,
      queues,
      metaQuality: meta,
      timestamp: new Date().toISOString(),
    },
    { status: 200, headers: { "Cache-Control": "no-cache, no-store" } },
  );
}
