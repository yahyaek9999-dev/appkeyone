/**
 * GET /api/admin/import — platform-wide view of the One-Time QR Import.
 *   → { ok, sessions, queue, totals }
 *     sessions: all ImportSession rows (newest first) enriched with user email/name.
 *     queue:    QrSlotJob counts for type="import" grouped by status.
 *     totals:   sessions count, completed count, sum(customersCreated),
 *               sum(conversationsImported), sum(messagesImported).
 *
 * Admin-only.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  try {
    const sessions = await prisma.importSession.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    // Enrich with user email/name for the admin table.
    const userIds = Array.from(new Set(sessions.map((s) => s.userId)));
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const enriched = sessions.map((s) => ({ ...s, user: byId.get(s.userId) || null }));

    // QR slot queue counts for import jobs, grouped by status.
    const grouped = await prisma.qrSlotJob.groupBy({
      by: ["status"],
      where: { type: "import" },
      _count: { _all: true },
    });
    const queue: Record<string, number> = {};
    for (const g of grouped) queue[g.status] = g._count._all;

    // Aggregate totals across all sessions.
    const agg = await prisma.importSession.aggregate({
      _sum: { customersCreated: true, conversationsImported: true, messagesImported: true, contactsImported: true, memoriesBuilt: true },
    });
    const completed = enriched.filter((s) => s.status === "completed" || s.status === "closed").length;

    const totals = {
      sessions: sessions.length,
      completed,
      customersCreated: agg._sum.customersCreated || 0,
      conversationsImported: agg._sum.conversationsImported || 0,
      messagesImported: agg._sum.messagesImported || 0,
      contactsImported: agg._sum.contactsImported || 0,
      memoriesBuilt: agg._sum.memoriesBuilt || 0,
    };

    return NextResponse.json({ ok: true, sessions: enriched, queue, totals });
  } catch (e: any) {
    return NextResponse.json({ error: "import_unavailable", detail: String(e?.message || e) }, { status: 500 });
  }
}
