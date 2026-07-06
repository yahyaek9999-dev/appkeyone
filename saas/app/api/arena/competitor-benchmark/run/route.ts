// POST /api/arena/competitor-benchmark/run — compute + persist a benchmark run.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { computeCompetitorBenchmark } from "@/lib/arena/competitor-bench";

export const dynamic = "force-dynamic";

export async function POST() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const run = await computeCompetitorBenchmark(uid);
  return NextResponse.json({ ok: true, run });
}
