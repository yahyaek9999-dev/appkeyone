import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "active";
  const where: any = { userId: user.id };
  if (status === "active") where.status = { in: ["open", "acknowledged", "human_active"] };
  else if (status !== "all") where.status = status;

  const items = await (prisma as any).escalationTicket.findMany({
    where,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 100,
  }).catch(() => []);

  const metrics = await Promise.all([
    (prisma as any).escalationTicket.count({ where: { userId: user.id, status: { in: ["open", "acknowledged", "human_active"] } } }).catch(() => 0),
    (prisma as any).escalationTicket.count({ where: { userId: user.id, severity: { in: ["high", "critical"] }, status: { in: ["open", "acknowledged", "human_active"] } } }).catch(() => 0),
    (prisma as any).escalationTicket.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }).catch(() => 0),
  ]);

  return NextResponse.json({
    ok: true,
    metrics: { active: metrics[0], critical: metrics[1], created24h: metrics[2] },
    items,
  });
}
