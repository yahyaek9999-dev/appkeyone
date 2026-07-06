// GET /api/arena/quality — latest + history + trend.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { getQuality } from "@/lib/arena/quality";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const data = await getQuality(uid);
  return NextResponse.json({ ok: true, ...data });
}
