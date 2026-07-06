// POST /api/arena/hallucinations/[id]/resolve — mark an event resolved.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { resolveHallucination } from "@/lib/arena/hallucination";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const res = await resolveHallucination(uid, params.id);
  if (!res.ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(res);
}
