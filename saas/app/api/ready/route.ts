// ---------------------------------------------------------------------------
// GET /api/ready — Deep readiness probe (Reliability Phase / Agent 3)
//
// Complements /api/health (shallow liveness). Where /api/health answers
// "is the process up and can it reach the DB?", /api/ready answers
// "is this instance safe to receive production traffic right now?".
//
// Used by:
//   - Health-gated deployment (deploy/health-gate.ps1) — a deploy is only
//     considered successful when /api/ready returns ready:true.
//   - Uptime monitors that want a stricter signal than liveness.
//
// Contract:
//   - Always returns HTTP 200 (degraded states are read from the body, never
//     the status code) UNLESS `?strict=1` is passed, in which case a
//     non-ready verdict returns HTTP 503 so simple HTTP monitors / load
//     balancers can gate on the status code directly.
//   - Read-only. No sends, no queue drains, no mutations.
//   - Target latency < 250ms — a handful of indexed COUNT queries only.
// ---------------------------------------------------------------------------
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { prisma } from "@/lib/db";

type CheckStatus = "ok" | "warn" | "fail";

interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
  meta?: Record<string, unknown>;
}

// A failed DB connectivity check means "not ready". A warn (e.g. a deep
// outgoing queue) means "serving but watch me" — it does not block a deploy.
function verdict(checks: Check[]): "ready" | "degraded" | "not_ready" {
  if (checks.some((c) => c.status === "fail")) return "not_ready";
  if (checks.some((c) => c.status === "warn")) return "degraded";
  return "ready";
}

export async function GET(req: Request) {
  const start = Date.now();
  const strict = new URL(req.url).searchParams.get("strict") === "1";
  const checks: Check[] = [];

  // ---- 1. Database connectivity (hard requirement) --------------------------
  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - t0;
    checks.push({
      name: "db",
      status: latencyMs > 500 ? "warn" : "ok",
      detail: latencyMs > 500 ? "db slow" : "db reachable",
      meta: { latencyMs },
    });
  } catch (err: unknown) {
    checks.push({
      name: "db",
      status: "fail",
      detail:
        process.env.NODE_ENV === "production"
          ? "db_unreachable"
          : String((err as Error)?.message ?? err).slice(0, 160),
    });
  }

  // ---- 2. Migration / schema sanity (soft) ----------------------------------
  // A freshly-deployed build that points at an un-migrated DB will fail to
  // count a core table. We probe one core table so a broken `prisma db push`
  // surfaces as not_ready rather than as 500s on real traffic.
  try {
    await prisma.user.count();
    checks.push({ name: "schema", status: "ok", detail: "core tables queryable" });
  } catch (err: unknown) {
    checks.push({
      name: "schema",
      status: "fail",
      detail: "core table query failed",
      meta: { error: String((err as Error)?.message ?? err).slice(0, 120) },
    });
  }

  // ---- 3. Outgoing queue backlog (soft / observability) ---------------------
  // Reuses the existing queue-health helper. A growing/stale backlog is a
  // warn (still ready to serve), never a hard fail — we don't want a busy
  // queue to abort a deploy.
  try {
    const { getOutgoingQueueHealth } = await import(
      "@/lib/messaging/outgoing-queue"
    );
    const q = await getOutgoingQueueHealth();
    const stale = q.staleQueued ?? 0;
    const oldest = q.oldestQueuedAgeSec ?? 0;
    const status: CheckStatus =
      stale > 0 || oldest > 1800 ? "warn" : "ok";
    checks.push({
      name: "outgoing_queue",
      status,
      detail:
        status === "warn"
          ? "queued backlog aging — drain may be behind"
          : "queue healthy",
      meta: {
        queued: q.queued,
        sending: q.sending,
        staleQueued: q.staleQueued,
        oldestQueuedAgeSec: q.oldestQueuedAgeSec,
        failed24h: q.failed24h,
      },
    });
  } catch (err: unknown) {
    // The queue health helper failing is itself a soft signal, not a reason
    // to mark the whole instance not-ready.
    checks.push({
      name: "outgoing_queue",
      status: "warn",
      detail: "queue health unavailable",
      meta: { error: String((err as Error)?.message ?? err).slice(0, 120) },
    });
  }

  const v = verdict(checks);
  const body = {
    ready: v === "ready",
    verdict: v,
    version:
      process.env.NEXT_PUBLIC_BUILD_ID ?? process.env.BUILD_ID ?? "dev",
    uptime: Math.floor(process.uptime()),
    checks,
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - start,
  };

  // In strict mode a non-ready verdict returns 503 so HTTP-only gates work.
  const httpStatus = strict && v === "not_ready" ? 503 : 200;

  return Response.json(body, {
    status: httpStatus,
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    },
  });
}
