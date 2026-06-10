import { NextResponse } from "next/server";
import { runAbandonedCartSweep } from "@/lib/commerce/abandoned-cart";
import { checkInternalSecret } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

/**
 * Abandoned-cart recovery sweep (Agent 3, Task #7).
 *
 * Triggered by a scheduled task on the VPS (suggested cadence: hourly). For
 * every merchant who opted in (bot.abandonedCartEnabled === true, OFF by
 * default) it queues ONE recovery follow-up per stale cart through the
 * PROTECTED queueSmartFollowUp path. Idempotent + flag-gated; does nothing
 * for merchants who have not enabled it.
 *
 * Query params (optional):
 *   ?userId=...           scope to a single merchant (testing)
 *   ?maxMerchants=N       cap merchants per run (default 200)
 *   ?maxPerMerchant=N     cap recoveries per merchant per run (default 50)
 */
export async function POST(req: Request) {
  if (!checkInternalSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") || undefined;
  const maxMerchants = Number(url.searchParams.get("maxMerchants")) || undefined;
  const maxPerMerchant = Number(url.searchParams.get("maxPerMerchant")) || undefined;

  try {
    const result = await runAbandonedCartSweep({ userId, maxMerchants, maxPerMerchant });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "sweep_failed" },
      { status: 500 },
    );
  }
}
