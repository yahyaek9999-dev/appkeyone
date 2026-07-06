// POST /api/arena/hallucinations/detect — run deterministic detection.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { detectHallucinations } from "@/lib/arena/hallucination";

export const dynamic = "force-dynamic";

export async function POST() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const result = await detectHallucinations(uid);
  return NextResponse.json({ ok: true, ...result });
}
