import { NextResponse } from "next/server";
import { runAffinityBatch } from "@/lib/commerce/affinity";

export const dynamic = "force-dynamic";

const SECRET =
  process.env.SAAS_INTERNAL_SECRET || "dev-internal-secret-change-me";

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
  if (req.headers.get("x-internal-secret") !== SECRET) {
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
