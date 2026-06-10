import { NextResponse } from "next/server";
import { runIdleAutomations } from "@/lib/automations/engine";
import { checkInternalSecret } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

/**
 * Automation engine — time-based runner (Agent 3, Task #8).
 *
 * Triggered by a scheduled task on the VPS (suggested cadence: every 30 min).
 * Evaluates enabled `idle_hours` rules across merchants. Event-driven triggers
 * (score_crossed, order_status_changed, cart_abandoned, stage_changed) fire
 * inline from their respective background paths and do NOT need this cron.
 *
 * All actions route through existing safe paths, throttled + globally capped
 * per customer. No-op for merchants without enabled idle_hours rules.
 *
 * Query params (optional):
 *   ?userId=...        scope to a single merchant (testing)
 *   ?maxMerchants=N    cap merchants per run (default 200)
 */
export async function POST(req: Request) {
  if (!checkInternalSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") || undefined;
  const maxMerchants = Number(url.searchParams.get("maxMerchants")) || undefined;

  try {
    const result = await runIdleAutomations({ userId, maxMerchants });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "automations_run_failed" },
      { status: 500 },
    );
  }
}
