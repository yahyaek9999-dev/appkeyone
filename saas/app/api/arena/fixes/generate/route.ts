// POST /api/arena/fixes/generate — create queued fixes from arena weaknesses.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { generateFixes } from "@/lib/arena/fixes";

export const dynamic = "force-dynamic";

export async function POST() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const result = await generateFixes(uid);
  return NextResponse.json({ ok: true, ...result });
}
