/**
 * GET /api/admin/payments — payment-provider analytics for the admin billing
 * center: aggregate stats (volume / status mix / reconciliation health) plus the
 * 50 most recent transactions. Admin-gated by requireAdmin().
 * Read window via ?days= (default 30).
 */
import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { getPaymentStats } from "@/lib/payments";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try { await requireAdmin(); } catch (e) { return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) }); }

  const days = Number(new URL(req.url).searchParams.get("days")) || 30;
  const stats = await getPaymentStats({ days });
  const recent = await prisma.paymentTransaction
    .findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        userId: true,
        provider: true,
        amountUsd: true,
        status: true,
        providerRef: true,
        createdAt: true,
        reconciledAt: true,
      },
    })
    .catch(() => []);

  return NextResponse.json({ ok: true, stats, recent });
}
