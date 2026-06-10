import { NextResponse } from "next/server";
import { runAffinityBatch } from "@/lib/commerce/affinity";
import { checkInternalSecret } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

/**
 * Product affinity batch (Agent 3, Task #9).
 *
 * Triggered by a scheduled task on the VPS (suggested cadence: daily, off-peak).
 * Recomputes the co-purchase matrix per merchant from OrderItem history and
 * persists it to ProductAffinity. Read-only on orders; idempotent. Has no
 * dependency on any feature flag — it only produces data the upsell detector
 * reads when present, so it is always safe to run.
 *
 * Query params (optional):
 *   ?userId=...        scope to a single merchant (testing)
 *   ?maxMerchants=N    cap merchants per run (default 500)
 */
export async function POST(req: Request) {
  if (!checkInternalSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") || undefined;
  const maxMerchants = Number(url.searchParams.get("maxMerchants")) || undefined;

  try {
    const result = await runAffinityBatch({ userId, maxMerchants });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "affinity_batch_failed" },
      { status: 500 },
    );
  }
}
