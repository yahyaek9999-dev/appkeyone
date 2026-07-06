// POST /api/bridge/v1/primary — choose the workspace's primary Bridge (Cloud).
//
// USER-facing. When a workspace runs more than one Bridge, exactly one is the
// "primary" (the connector the send path prefers, in Phase 2). This is a pure
// Cloud-side bookkeeping flip — it needs NO WhatsApp auth and NO WS gateway, so
// it is safe to ship in Phase 1. Scoped strictly to the caller's workspace.
//
// Setting a new primary clears the flag on every other Bridge of the workspace
// in the same transaction, so the "exactly one primary" invariant always holds.
//
// Gated: 404 when BRIDGE_ENABLED is off. Auth: requirePermission("settings").

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, authErrorStatus } from "@/lib/auth";
import { bridgeEnabled } from "@/lib/bridge/flags";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const PrimaryBody = z.object({
  bridge_id: z.string().min(1).max(64),
});

export async function POST(req: Request) {
  if (!bridgeEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let user;
  try {
    user = await requirePermission("settings");
  } catch (e) {
    return NextResponse.json({ error: "unauthorized" }, { status: authErrorStatus(e) });
  }

  const limited = enforceRateLimit(req, { name: "bridge-primary", ...RATE_LIMITS.api });
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = PrimaryBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_body", detail: parsed.error.message }, { status: 400 });
  }

  // Ownership check: only a live (non-revoked) Bridge of the caller can be primary.
  const bridge = await (prisma as any).bridge.findFirst({
    where: { id: parsed.data.bridge_id, userId: user.id, revokedAt: null },
    select: { id: true },
  });
  if (!bridge) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await (tx as any).bridge.updateMany({
      where: { userId: user.id, isPrimary: true, NOT: { id: bridge.id } },
      data: { isPrimary: false },
    });
    await (tx as any).bridge.update({
      where: { id: bridge.id },
      data: { isPrimary: true },
    });
  });

  return NextResponse.json({ ok: true });
}
