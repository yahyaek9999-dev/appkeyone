// GET /api/ai-audit — live audit issues + latest persisted run summary.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { computeAudit } from "@/lib/ai-audit/auditor";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const [result, lastRun] = await Promise.all([
    computeAudit(uid),
    prisma.aiAuditRun.findFirst({ where: { userId: uid }, orderBy: { createdAt: "desc" } }),
  ]);
  return NextResponse.json({ ok: true, ...result, lastRun });
}
