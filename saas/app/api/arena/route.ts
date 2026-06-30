// GET /api/arena — latest run + per-category breakdown + weaknesses + samples +
// competitor benchmark + scenario corpus size.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { getLatestArena } from "@/lib/arena/runner";
import { competitorBenchmark } from "@/lib/arena/competitors";
import { SCENARIOS, SCENARIO_CATEGORIES } from "@/lib/arena/scenarios";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const latest = await getLatestArena(uid);
  return NextResponse.json({
    ok: true,
    corpus: { total: SCENARIOS.length, categories: SCENARIO_CATEGORIES },
    ...latest,
    competitors: competitorBenchmark(),
  });
}
