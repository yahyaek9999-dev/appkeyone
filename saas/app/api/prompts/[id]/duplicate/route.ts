// POST /api/prompts/[id]/duplicate — duplicate a version into a new draft.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { duplicateVersion } from "@/lib/prompts/manager";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const v = await duplicateVersion(uid, params.id);
  if (!v) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, version: v });
}
