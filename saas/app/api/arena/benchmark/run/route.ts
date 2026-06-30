// POST /api/arena/benchmark/run — compute + persist Brain Benchmark (TA-7) and
// AI Readiness (TA-9) from the tenant's real signals.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { runBenchmarks } from "@/lib/arena/benchmark";

export const dynamic = "force-dynamic";

export async function POST() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const result = await runBenchmarks(uid);
  return NextResponse.json({ ok: true, ...result });
}
