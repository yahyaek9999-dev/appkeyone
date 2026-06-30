// POST /api/knowledge/conflicts/[id]/resolve  — mark a conflict resolved.
// IDOR-safe: the update is scoped to (id, userId) so a tenant can only resolve
// their own conflicts.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const upd = await prisma.knowledgeConflict.updateMany({
    where: { id: params.id, userId: uid },
    data: { resolved: true, resolvedAt: new Date() },
  });
  if (upd.count === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
