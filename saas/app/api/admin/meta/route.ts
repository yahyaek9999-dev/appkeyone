// Meta Enterprise — admin control center: tenant list + global summary + init.
//   GET  → list of tenants with Meta status, plan access, wallet balance, and
//          pending-conversation counts, plus a platform-wide summary.
//   POST { action: "init" } → seed default pricing + limits (idempotent).
// Admin-only (requireAdmin). Reuses lib/meta + lib/messaging/feature-flags.
import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { ensureMetaDefaults } from "@/lib/meta";
import { planMetaAccess } from "@/lib/messaging/feature-flags";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
  }

  const [users, pendingGroups, rateCount, limitCount, txnAgg] = await Promise.all([
    prisma.user.findMany({
      where: { role: { not: "admin" } },
      select: {
        id: true,
        email: true,
        name: true,
        subscription: { select: { status: true, plan: { select: { slug: true, name: true } } } },
        metaTenant: true,
        wallet: { select: { balanceUsd: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.metaConversation.groupBy({
      by: ["userId"],
      where: { billingStatus: "pending" },
      _count: { _all: true },
      _sum: { chargedMicroUsd: true },
    }),
    prisma.metaRate.count(),
    prisma.metaLimit.count(),
    prisma.metaTransaction.aggregate({ where: { kind: "charge" }, _sum: { amountEgp: true } }),
  ]);

  const pendingByUser = new Map(pendingGroups.map((g) => [g.userId, g._count._all]));

  const tenants = users.map((u) => {
    const planSlug =
      u.subscription?.status === "active" ? (u.subscription.plan?.slug ?? null) : null;
    return {
      userId: u.id,
      email: u.email,
      name: u.name,
      planSlug,
      planName: u.subscription?.plan?.name ?? null,
      metaAccess: planMetaAccess(planSlug),
      status: u.metaTenant?.status ?? "not_provisioned",
      healthStatus: u.metaTenant?.healthStatus ?? "unknown",
      qualityRating: u.metaTenant?.qualityRating ?? null,
      connectionStatus: u.metaTenant?.connectionStatus ?? "disconnected",
      balanceUsd: u.wallet?.balanceUsd ?? 0,
      pendingConversations: pendingByUser.get(u.id) ?? 0,
    };
  });

  const summary = {
    totalTenants: tenants.length,
    provisioned: tenants.filter((t) => t.status !== "not_provisioned").length,
    enabled: tenants.filter((t) => t.status === "enabled").length,
    totalBalanceUsd: tenants.reduce((s, t) => s + t.balanceUsd, 0),
    totalPendingConversations: tenants.reduce((s, t) => s + t.pendingConversations, 0),
    totalChargedEgp: Math.abs(txnAgg._sum.amountEgp ?? 0),
    ratesConfigured: rateCount,
    limitsConfigured: limitCount,
  };

  return NextResponse.json({ ok: true, summary, tenants });
}

const PostBody = z.object({ action: z.literal("init") });

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
  }
  const parsed = PostBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const seeded = await ensureMetaDefaults();
  return NextResponse.json({ ok: true, seeded });
}
