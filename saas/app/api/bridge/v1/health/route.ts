// GET /api/bridge/v1/health — KEYONE Bridge liveness probe (Cloud side).
//
// Public-ish: no auth (a Bridge checks reachability before it has a token), but
// STILL 404s when BRIDGE_ENABLED is off, so the entire transport is invisible
// to existing tenants / Meta Cloud / legacy QR until Bridge is switched on.

import { NextResponse } from "next/server";
import { bridgeEnabled } from "@/lib/bridge/flags";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!bridgeEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    service: "keyone-bridge-cloud",
    protocol: 1,
    ts: Date.now(),
  });
}
