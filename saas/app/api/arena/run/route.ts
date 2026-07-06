// POST /api/arena/run — run the full scenario corpus through the retrieval
// engine and persist the results.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { runArena } from "@/lib/arena/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const result = await runArena(uid);
  return NextResponse.json({ ok: true, ...result });
}
