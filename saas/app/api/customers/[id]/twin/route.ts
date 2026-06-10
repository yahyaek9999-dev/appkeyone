// Customer Twin — lookalike outcomes for one customer (Agent 1 — Task 2).
//
// GET /api/customers/[id]/twin → finds the K most-similar PAST customers of the
// same merchant (cosine over the score vector the pipeline already wrote) and
// aggregates their outcomes into a single predicted action + historical close
// rate. Read-only, per-tenant, bounded (top-500 candidate scan), gated.
//
// See lib/intelligence/customer-twin.ts for the engine.

import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";
import { getEffectivePlan } from "@/lib/membership/plan";
import { buildCustomerTwin } from "@/lib/intelligence/customer-twin";
import { intelTenantEnabled } from "@/lib/intelligence/flags";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const gate = await apiGate("smart_assistant");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("customers");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  // Env kill-switch + per-plan gate. Fail-closed → the 360 card just hides.
  const plan = await getEffectivePlan(uid).catch(() => null);
  if (!intelTenantEnabled("INTEL_CUSTOMER_TWIN", plan, "customer_twin")) {
    return NextResponse.json({ enabled: false, twin: null });
  }

  try {
    const twin = await buildCustomerTwin(uid, params.id);
    if (!twin) return NextResponse.json({ enabled: true, twin: null });
    return NextResponse.json({ enabled: true, twin });
  } catch {
    // Never surface an error into the profile UI — degrade to "no twin".
    return NextResponse.json({ enabled: true, twin: null });
  }
}
