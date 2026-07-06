// POST /api/arena/simulate  { category?, scenarioId? } — run multi-turn sims.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { simulateBatch } from "@/lib/arena/simulator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const results = await simulateBatch(uid, {
    scenarioId: body?.scenarioId,
    category: body?.category,
  });
  return NextResponse.json({ ok: true, results });
}
