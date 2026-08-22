// GET /api/bridge/v1/status — the caller's Bridges + transports (Cloud).
//
// USER-facing. Returns the workspace owner's non-revoked Bridges with their
// telemetry (os, version, status, lastHeartbeatAt, isPrimary) and each Bridge's
// transports (provider, state, identity). NEVER exposes tokenHash or any secret.
// Used by the dashboard Bridge settings surface (Phase 2 wires the chooser).
//
// Gated: 404 when BRIDGE_ENABLED is off. Auth: requirePermission("settings").

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission, authErrorStatus } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";
import { bridgeEnabled } from "@/lib/bridge/flags";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!bridgeEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const gate = await apiGate("whatsapp_bridge");
  if (gate.response) return gate.response;

  let user;
  try {
    user = await requirePermission("settings");
  } catch (e) {
    return NextResponse.json({ error: "unauthorized" }, { status: authErrorStatus(e) });
  }

  const bridges = await (prisma as any).bridge.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    // Explicit select — tokenHash is deliberately excluded so it can never leak.
    select: {
      id: true,
      name: true,
      os: true,
      arch: true,
      version: true,
      status: true,
      isPrimary: true,
      lastHeartbeatAt: true,
      createdAt: true,
      transports: {
        select: {
          id: true,
          provider: true,
          state: true,
          identity: true,
          updatedAt: true,
        },
        orderBy: { provider: "asc" },
      },
    },
  });

  return NextResponse.json({ ok: true, bridges });
}
