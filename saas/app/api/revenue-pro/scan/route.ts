// POST /api/revenue-pro/scan — compute + persist a revenue snapshot.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { computeRevenue } from "@/lib/revenue/engine";

export const dynamic = "force-dynamic";

export async function POST() {
  const uid = await getUserIdForPermission("analytics");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const result = await computeRevenue(uid);
  return NextResponse.json({ ok: true, ...result });
}
