// POST /api/arena/fixes/[id]/reject — reject (dismiss) a queued fix.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { rejectFix } from "@/lib/arena/fixes";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const res = await rejectFix(uid, params.id);
  if (!res.ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(res);
}
