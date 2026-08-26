// ---------------------------------------------------------------------------
// GET /api/health — Public liveness / readiness probe (Phase 7)
//
// Contract:
//   - Always returns HTTP 200 (even when degraded). Downstream monitors
//     read the `status` field, not the HTTP code, to decide alerting.
//   - Response time target: < 100 ms. We only hit the DB with a trivial
//     `SELECT 1`; no external services are checked here.
//   - Cache-Control: no-cache, no-store — proxies must not serve stale
//     health data to uptime monitors.
//   - No auth required — monitors call this without credentials.
// ---------------------------------------------------------------------------
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { prisma } from "@/lib/db";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Deployed build identity. Next inlines `process.env.*` into the server bundle
// at build time, so a runtime-only env var folds to the fallback and the probe
// reports a stale value forever. The deploy writes the pinned SHA to
// DEPLOYED_COMMIT next to the app, so read that at runtime instead — it is the
// same marker release-aws.sh verifies after every deploy.
let cachedVersion: string | null = null;
function deployedVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const sha = readFileSync(join(process.cwd(), "DEPLOYED_COMMIT"), "utf8").trim();
    if (sha) return (cachedVersion = sha.slice(0, 7));
  } catch {
    // not deployed (local dev) — fall through
  }
  cachedVersion = process.env.NEXT_PUBLIC_BUILD_ID ?? process.env.BUILD_ID ?? "dev";
  return cachedVersion;
}

type DbStatus = "ok" | "error";
type OverallStatus = "ok" | "degraded";

export async function GET() {
  const start = Date.now();

  // ---- Database connectivity check ------------------------------------------
  // A raw `SELECT 1` is the lightest possible query. It exercises the
  // connection pool without touching any application table. We catch and
  // swallow the error deliberately — a DB blip should degrade, not crash.
  let dbStatus: DbStatus = "ok";
  let dbError: string | undefined;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err: unknown) {
    dbStatus = "error";
    dbError =
      process.env.NODE_ENV === "production"
        ? "db_unreachable" // don't leak internals in prod
        : String((err as Error)?.message ?? err).slice(0, 200);
  }

  // ---- Aggregate status -------------------------------------------------------
  const status: OverallStatus = dbStatus === "ok" ? "ok" : "degraded";

  // ---- Response payload -------------------------------------------------------
  const body = {
    status,
    db: dbStatus,
    // Number of seconds the Node.js process has been running
    uptime: Math.floor(process.uptime()),
    // BUILD_ID is injected by Next.js at build time via the env. Falls back
    // to "dev" in local development where it is not set.
    version: deployedVersion(),
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - start,
    // Only present when degraded — helps monitors triage without a Sentry lookup
    ...(dbError ? { dbError } : {}),
  };

  return Response.json(body, {
    status: 200, // always 200 — let monitors read `status` field
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    },
  });
}
