// GET /api/arena/prompt-benchmark — latest + history + trend.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { getPromptBenchmarks } from "@/lib/arena/prompt-bench";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const data = await getPromptBenchmarks(uid);
  return NextResponse.json({ ok: true, ...data });
}
