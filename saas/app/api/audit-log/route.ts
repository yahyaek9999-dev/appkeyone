// GET /api/audit-log — paginated, filterable audit history for the workspace.
//
// Gated by the "team" permission (owner + admin). Returns rows scoped to the
// owner's workspace only. Read-only; never exposes secrets (the emitter already
// redacts metadata at write time).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserForPermission } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // audit_log is a Pro (tier 2) capability and the page is gated on it; gate the
  // data boundary too so the entitlement isn't readable straight from the API.
  const gate = await apiGate("audit_log", "team");
  if (gate.response) return gate.response;
  const user = await getUserForPermission("team");
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || undefined;
  const actorEmail = url.searchParams.get("actor") || undefined;
  const take = Math.min(200, Math.max(1, Number(url.searchParams.get("take") || 100)));
  const skip = Math.max(0, Number(url.searchParams.get("skip") || 0));

  const where: any = { userId: user.id };
  if (action) where.action = action;
  if (actorEmail) where.actorEmail = actorEmail;

  try {
    const [items, total] = await Promise.all([
      (prisma as any).auditLog.findMany({
        where,
        orderBy: { at: "desc" },
        take,
        skip,
      }),
      (prisma as any).auditLog.count({ where }),
    ]);
    return NextResponse.json({ ok: true, total, items });
  } catch (e: any) {
    // Table may not exist yet (pre db push) — degrade gracefully.
    return NextResponse.json({ ok: true, total: 0, items: [], note: "audit_log_unavailable" });
  }
}
