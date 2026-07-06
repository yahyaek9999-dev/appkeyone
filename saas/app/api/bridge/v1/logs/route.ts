// GET /api/bridge/v1/logs?bridgeId=&limit= — recent Bridge log lines (Dashboard).
//
// USER-facing. Returns the log ring the Bridge streams to the Cloud, newest
// last, scoped strictly to a Bridge the caller owns. Gated: 404 when off.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission, authErrorStatus } from "@/lib/auth";
import { bridgeEnabled } from "@/lib/bridge/flags";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!bridgeEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  let user;
  try {
    user = await requirePermission("settings");
  } catch (e) {
    return NextResponse.json({ error: "unauthorized" }, { status: authErrorStatus(e) });
  }

  const url = new URL(req.url);
  const bridgeId = url.searchParams.get("bridgeId") || "";
  const limit = Math.min(Number(url.searchParams.get("limit") || 200), 500);

  // Ownership check.
  const owned = await (prisma as any).bridge.findFirst({
    where: { id: bridgeId, userId: user.id, revokedAt: null },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const rows = await (prisma as any).bridgeLogLine.findMany({
    where: { bridgeId },
    orderBy: { at: "desc" },
    take: limit,
    select: { at: true, level: true, message: true },
  });
  // Return oldest → newest for natural reading.
  const lines = rows
    .reverse()
    .map((r: any) => ({ at: new Date(r.at).toISOString(), level: r.level, message: r.message }));

  return NextResponse.json({ lines }, { headers: { "Cache-Control": "no-store" } });
}
