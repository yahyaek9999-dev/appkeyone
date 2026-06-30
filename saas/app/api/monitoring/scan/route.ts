// POST /api/monitoring/scan — run anomaly + risk detection, persist snapshot.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { runScan } from "@/lib/monitoring/engine";

export const dynamic = "force-dynamic";

export async function POST() {
  const uid = await getUserIdForPermission("analytics");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const result = await runScan(uid);
  return NextResponse.json({ ok: true, ...result });
}
