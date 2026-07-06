// GET /api/arena/hallucinations — events + dashboard counts.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { listHallucinations } from "@/lib/arena/hallucination";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const data = await listHallucinations(uid);
  return NextResponse.json({ ok: true, ...data });
}
