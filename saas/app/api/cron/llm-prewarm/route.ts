import { NextResponse } from "next/server";
import { checkInternalSecret } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

/**
 * LLM Pre-warm cron.
 *
 * Hits every configured LLM instance with a tiny request to keep the
 * underlying Chromium / scraper context "hot" so the next real request
 * doesn't pay a cold-start (which on CloakBrowser can be 10-20s and may
 * even produce a navigation-destroyed error).
 *
 * Triggered by an internal scheduled task every 1-2 minutes.
 * Auth: `x-internal-secret` header must match SAAS_INTERNAL_SECRET.
 *
 * NOTE: This does NOT modify or wrap LLM responses. It only sends a
 *       "ping" request and discards the result. Quality is unaffected.
 */
export async function POST(req: Request) {
  if (!checkInternalSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // In-house mse_ai_api engine REMOVED — there is no LLM cluster to pre-warm.
  // Kept as a 200 no-op so any still-scheduled task doesn't start erroring.
  return NextResponse.json({
    ok: true,
    pinged: 0,
    healthy: 0,
    results: [],
    note: "in-house LLM engine removed; nothing to pre-warm",
  });
}

function getLlmUrls(): string[] {
  const multi = (process.env.LLM_API_URLS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (multi.length > 0) return multi;
  return [process.env.LLM_API_URL || "http://127.0.0.1:7788"];
}
