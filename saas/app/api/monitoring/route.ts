// GET /api/monitoring — latest snapshot + history + trend + alerts.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { getMonitoring } from "@/lib/monitoring/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserIdForPermission("analytics");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const data = await getMonitoring(uid);
  return NextResponse.json({ ok: true, ...data });
}
