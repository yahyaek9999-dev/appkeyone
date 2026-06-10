// ---------------------------------------------------------------------------
// GET /api/internal/tenant-costs — Per-merchant cost & performance (Agent 4)
//
// INTERNAL endpoint — requires the `x-internal-secret` header matching
// SAAS_INTERNAL_SECRET. Same auth contract as /api/internal/metrics and
// /api/internal/wa-health. Read-only: attributes LLM token spend + estimated
// USD, LLM failure rate + average latency, WhatsApp send success rate, and
// per-merchant message volume over a trailing window.
//
// Query params:
//   ?days=7    — window length (1..90, default 30)
//
// NEVER throws — the compute layer catches per-query and degrades to empty.
// Always returns HTTP 200 (401 only on auth failure). Response is never cached.
// ---------------------------------------------------------------------------
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getTenantCosts } from "@/lib/observability/tenant-costs";
import { flush } from "@/lib/metrics";
import { checkInternalSecret } from "@/lib/internal-auth";

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  if (!checkInternalSecret(req)) {
    return unauthorized();
  }

  // Flush the in-memory metrics buffer so very-recent LLM activity is included.
  await flush().catch(() => {});

  const daysParam = new URL(req.url).searchParams.get("days");
  const days = daysParam ? Number(daysParam) : 30;

  const data = await getTenantCosts({
    days: Number.isFinite(days) ? days : 30,
  }).catch((err: unknown) => ({
    error: String((err as Error)?.message ?? err).slice(0, 200),
  }));

  return Response.json(data, {
    status: 200,
    headers: { "Cache-Control": "no-cache, no-store" },
  });
}
