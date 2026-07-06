// GET /api/knowledge/conflicts  — list this tenant's knowledge conflicts.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const rows = await prisma.knowledgeConflict.findMany({
    where: { userId: uid },
    orderBy: [{ resolved: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  const open = rows.filter((r) => !r.resolved).length;
  return NextResponse.json({ ok: true, open, conflicts: rows });
}
