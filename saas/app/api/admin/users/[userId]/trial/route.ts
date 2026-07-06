/**
 * Admin: grant / revoke a free trial (Area 3 — Trial Management).
 *
 * POST   /api/admin/users/:userId/trial { hours }  → start a trial (6/24/72/168h)
 * DELETE /api/admin/users/:userId/trial            → end the current trial now
 *
 * A trial creates/updates the user's Subscription with status="trial" and the
 * trial window (trialStartsAt/trialEndsAt). Activation lockdown (Area 4) reads
 * these to unlock features for the trial window and re-lock when it expires.
 * Granting a trial also approves the account so it can log in.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

// No Trial is the absence of a grant; the UI offers 6h / 24h / 3d / 7d.
const ALLOWED_HOURS = new Set([6, 24, 72, 168]);

async function resolveTrialPlan(planSlug?: string | null) {
  if (planSlug) {
    const p = await prisma.plan.findUnique({ where: { slug: planSlug } });
    if (p) return p;
  }
  // Prefer the cheapest public catalog plan (k_*) so the trial mirrors a real
  // entry tier; fall back to any plan if none are seeded.
  const kPlans = await prisma.plan.findMany({
    where: { slug: { startsWith: "k_" } },
    orderBy: { priceUsd: "asc" },
  });
  if (kPlans.length) return kPlans[0];
  return prisma.plan.findFirst({ orderBy: { priceUsd: "asc" } });
}

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const hours = Number(body?.hours);
  if (!ALLOWED_HOURS.has(hours)) {
    return NextResponse.json({ error: "invalid_duration" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, role: true },
  });
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  if (target.role === "admin")
    return NextResponse.json({ error: "cannot_trial_admin" }, { status: 400 });

  const plan = await resolveTrialPlan(body?.planSlug);
  if (!plan) return NextResponse.json({ error: "no_plan_available" }, { status: 400 });

  const now = new Date();
  const ends = new Date(now.getTime() + hours * 3_600_000);

  const trialData = {
    planId: plan.id,
    status: "trial",
    startedAt: now,
    expiresAt: ends,
    trialStartsAt: now,
    trialEndsAt: ends,
    trialDurationHours: hours,
    trialGrantedBy: admin.email,
  } as any;

  await prisma.subscription.upsert({
    where: { userId: target.id },
    update: trialData,
    create: { userId: target.id, ...trialData },
  });

  // A granted trial implies the account is cleared to log in.
  await prisma.user
    .update({
      where: { id: target.id },
      data: { approvalStatus: "approved", approvedAt: now, approvedBy: admin.email } as any,
    })
    .catch(() => {});

  return NextResponse.json({
    ok: true,
    status: "trial",
    hours,
    trialEndsAt: ends.toISOString(),
    plan: plan.name,
  });
}

export async function DELETE(_req: Request, { params }: { params: { userId: string } }) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  void admin;

  const sub = await prisma.subscription.findUnique({ where: { userId: params.userId } });
  if (!sub) return NextResponse.json({ ok: true, status: "none" });
  if (sub.status === "trial") {
    await prisma.subscription.update({
      where: { userId: params.userId },
      data: { status: "expired", trialEndsAt: new Date() } as any,
    });
  }
  return NextResponse.json({ ok: true, status: "expired" });
}
