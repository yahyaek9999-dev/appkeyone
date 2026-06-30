// GET /api/arena/fixes — queue + history.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { listFixes } from "@/lib/arena/fixes";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const data = await listFixes(uid);
  return NextResponse.json({ ok: true, ...data });
}
