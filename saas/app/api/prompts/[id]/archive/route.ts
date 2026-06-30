// POST /api/prompts/[id]/archive — archive a non-published version.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { archiveVersion } from "@/lib/prompts/manager";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const res = await archiveVersion(uid, params.id);
  if (!res) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 409 });
  return NextResponse.json(res);
}
