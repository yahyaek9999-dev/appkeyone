// POST /api/ai-audit/run — run the deterministic audit + persist a run row.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { runAudit } from "@/lib/ai-audit/auditor";

export const dynamic = "force-dynamic";

export async function POST() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const result = await runAudit(uid);
  return NextResponse.json({ ok: true, ...result });
}
