// POST /api/arena/optimize/[id]/run — execute an optimization job (real action
// + re-run arena to record before/after).
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { runJob } from "@/lib/arena/optimize";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const res = await runJob(uid, params.id);
  if (!res) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 409 });
  return NextResponse.json(res);
}
