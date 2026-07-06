// POST /api/knowledge/conflicts/scan — run deterministic conflict detection.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { scanConflicts } from "@/lib/knowledge-brain/conflicts";

export const dynamic = "force-dynamic";

export async function POST() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const result = await scanConflicts(uid);
  return NextResponse.json({ ok: true, ...result });
}
