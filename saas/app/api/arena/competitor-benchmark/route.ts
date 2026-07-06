// GET /api/arena/competitor-benchmark — latest + history + baselines + trend.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { getCompetitorBenchmarks } from "@/lib/arena/competitor-bench";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const data = await getCompetitorBenchmarks(uid);
  return NextResponse.json({ ok: true, ...data });
}
