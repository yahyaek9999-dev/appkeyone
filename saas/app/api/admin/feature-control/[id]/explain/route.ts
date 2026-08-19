// GET /api/admin/feature-control/[id]/explain → canonical explainability trace
// for one feature. Admin-only. Consumes lib/admin/feature-explain (which itself
// consumes the canonical feature-control engine) — no second entitlement result.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { explainFeature } from "@/lib/admin/feature-explain";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const explanation = await explainFeature(params.id);
  if (!explanation) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, explanation });
}
