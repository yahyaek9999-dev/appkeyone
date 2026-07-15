/**
 * GET /api/admin/qr-queue — admin QR Queue analytics + live snapshot + recent
 * reservations. Admin-only. Query: ?days=7|30|90 (defaults 30).
 *
 * Read-only. Mutations go through /api/admin/qr-queue/[id]. Never touches the
 * WhatsApp send pipeline.
 */
import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getQueueAnalytics, getQueueSnapshot } from "@/lib/qr-queue";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try { await requireAdmin(); }
  catch (e) { return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) }); }

  const url = new URL(req.url);
  const d = url.searchParams.get("days");
  const days = d === "7" ? 7 : d === "90" ? 90 : 30;

  try {
    const [analytics, snapshot, reservations] = await Promise.all([
      getQueueAnalytics({ days }).catch(() => null),
      getQueueSnapshot().catch(() => null),
      prisma.qrReservation
        .findMany({ orderBy: { windowStart: "desc" }, take: 100 })
        .catch(() => []),
    ]);
    return NextResponse.json({ ok: true, analytics, snapshot, reservations });
  } catch (e: any) {
    return NextResponse.json({ error: "stats_unavailable", detail: String(e?.message || e) }, { status: 500 });
  }
}
