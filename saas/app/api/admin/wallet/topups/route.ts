/**
 * GET /api/admin/wallet/topups — list wallet top-up requests (default pending).
 * Admin-only. Query: ?status=pending|approved|rejected|all
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "pending";
  try {
    const items = await prisma.walletTopupRequest.findMany({
      where: status === "all" ? {} : { status },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const userIds = Array.from(new Set(items.map((i) => i.userId)));
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return NextResponse.json({ ok: true, items: items.map((i) => ({ ...i, user: byId.get(i.userId) || null })) });
  } catch {
    return NextResponse.json({ ok: true, items: [], pending: true });
  }
}
