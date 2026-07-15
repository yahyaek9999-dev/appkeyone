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

import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { grantTrial } from "@/lib/membership/trial";
import { audit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

// No Trial is the absence of a grant; the UI offers 6h / 24h / 3d / 7d.
const ALLOWED_HOURS = new Set([6, 24, 72, 168]);

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
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

  const granted = await grantTrial(target.id, hours, {
    planSlug: body?.planSlug,
    grantedBy: admin.email,
    approve: true,
  });
  if (!granted) return NextResponse.json({ error: "no_plan_available" }, { status: 400 });

  void audit({
    userId: target.id, action: "admin.trial_granted", actorId: (admin as any)?.id || null, actorEmail: admin.email || null, actorRole: "admin",
    targetType: "user", targetId: target.id, metadata: { hours, plan: granted.plan.name }, req,
  });

  return NextResponse.json({
    ok: true,
    status: "trial",
    hours,
    trialEndsAt: granted.trialEndsAt.toISOString(),
    plan: granted.plan.name,
  });
}

export async function DELETE(_req: Request, { params }: { params: { userId: string } }) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
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
