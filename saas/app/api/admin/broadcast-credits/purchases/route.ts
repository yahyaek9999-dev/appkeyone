/**
 * GET /api/admin/broadcast-credits/purchases — list broadcast-credit purchase
 * requests (default pending), enriched with the requesting user's email/name.
 * Admin-only. Query: ?status=pending|approved|rejected|all
 */
import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try { await requireAdmin(); }
  catch (e) { return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) }); }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "pending";
  try {
    const items = await prisma.broadcastCreditPurchaseRequest.findMany({
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
