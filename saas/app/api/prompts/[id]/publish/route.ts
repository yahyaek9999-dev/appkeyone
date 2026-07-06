// POST /api/prompts/[id]/publish — publish (or rollback to) a version.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { publishVersion } from "@/lib/prompts/manager";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const res = await publishVersion(uid, params.id);
  if (!res) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(res);
}
