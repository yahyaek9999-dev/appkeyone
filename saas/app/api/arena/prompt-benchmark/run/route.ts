// POST /api/arena/prompt-benchmark/run — benchmark prompt candidates.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { runPromptBenchmark } from "@/lib/arena/prompt-bench";

export const dynamic = "force-dynamic";

export async function POST() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const result = await runPromptBenchmark(uid);
  return NextResponse.json({ ok: true, ...result });
}
