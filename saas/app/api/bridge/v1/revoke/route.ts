// POST /api/bridge/v1/revoke — owner-initiated Bridge de-authorization (Cloud).
//
// USER-facing. The workspace owner (or a "settings" member) unlinks one of their
// Bridges: we stamp Bridge.revokedAt, flip it offline, and revoke every live
// BridgeToken for it (so any outstanding token — and any rotation attempt — is
// dead). Scoped strictly to the caller's workspace: you can only revoke a Bridge
// whose userId is yours.
//
// Gated: 404 when BRIDGE_ENABLED is off. Auth: requirePermission("settings").

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, authErrorStatus } from "@/lib/auth";
import { bridgeEnabled } from "@/lib/bridge/flags";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const RevokeBody = z.object({
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

  const limited = enforceRateLimit(req, { name: "bridge-revoke", ...RATE_LIMITS.api });
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = RevokeBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_body", detail: parsed.error.message }, { status: 400 });
  }

  // Enforce workspace ownership: only revoke a Bridge that belongs to caller.
  const bridge = await (prisma as any).bridge.findFirst({
    where: { id: parsed.data.bridge_id, userId: user.id },
    select: { id: true, revokedAt: true },
  });
  if (!bridge) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await (tx as any).bridge.update({
      where: { id: bridge.id },
      data: { revokedAt: bridge.revokedAt ?? now, status: "offline" },
    });
    await (tx as any).bridgeToken.updateMany({
      where: { bridgeId: bridge.id, revokedAt: null },
      data: { revokedAt: now },
    });
  });

  return NextResponse.json({ ok: true });
}
