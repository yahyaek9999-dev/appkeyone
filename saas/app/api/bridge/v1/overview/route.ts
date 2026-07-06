// GET /api/bridge/v1/overview — the Dashboard's single polling endpoint.
//
// USER-facing. Returns the read-only view-model for every Bridge in the caller's
// workspace (derived status, device telemetry, WhatsApp link state, latest QR,
// diagnostics, latest available version). No token hashes. Gated: 404 when off.

import { NextResponse } from "next/server";
import { requirePermission, authErrorStatus } from "@/lib/auth";
import { bridgeEnabled } from "@/lib/bridge/flags";
import { getBridgeOverview } from "@/lib/bridge/overview";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!bridgeEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  let user;
  try {
    user = await requirePermission("settings");
  } catch (e) {
    return NextResponse.json({ error: "unauthorized" }, { status: authErrorStatus(e) });
  }
  const overview = await getBridgeOverview(user.id);
  return NextResponse.json(overview, {
    headers: { "Cache-Control": "no-store" },
  });
}
