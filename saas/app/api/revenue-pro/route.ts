// GET /api/revenue-pro — snapshot + history + cohorts + top customers + recs.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { getRevenue } from "@/lib/revenue/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserIdForPermission("analytics");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const data = await getRevenue(uid);
  return NextResponse.json({ ok: true, ...data });
}
