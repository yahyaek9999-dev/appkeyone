import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

const Body = z.object({
  userId: z.string(),
  planSlug: z.string(),
  billingCycle: z.enum(["monthly", "yearly"]).default("monthly"),
  paymentRef: z.string().optional(),
  adminNote: z.string().optional(),
  durationDays: z.number().int().positive().optional(), // override duration
});

/**
 * Create / activate / renew a subscription for a user.
 *  - If user has no subscription -> create with status="active".
 *  - If user has one -> extend expiresAt and reset msgsUsed, set status="active".
 */
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  const { userId, planSlug, billingCycle, paymentRef, adminNote, durationDays } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });

  const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
  if (!plan) return NextResponse.json({ error: "الباقة غير موجودة" }, { status: 404 });

  // Compute new expiresAt: extend from now (or current expiry if still valid).
  const days = durationDays ?? (billingCycle === "yearly" ? 365 : 30);
  const existing = await prisma.subscription.findUnique({ where: { userId } });
  const baseTime =
    existing && existing.status === "active" && existing.expiresAt.getTime() > Date.now()
      ? existing.expiresAt.getTime()
      : Date.now();
  const newExpires = new Date(baseTime + days * 24 * 60 * 60 * 1000);

  const sub = await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      planId: plan.id,
      status: "active",
      billingCycle,
      expiresAt: newExpires,
      paymentRef,
      adminNote,
    },
    update: {
      planId: plan.id,
      status: "active",
      billingCycle,
      expiresAt: newExpires,
      msgsUsed: 0, // reset for new cycle
      paymentRef: paymentRef ?? existing?.paymentRef,
      adminNote: adminNote ?? existing?.adminNote,
    },
    include: { plan: true, user: { select: { email: true, name: true } } },
  });

  return NextResponse.json({ ok: true, subscription: sub });
}

const PatchBody = z.object({
  userId: z.string(),
  action: z.enum(["cancel", "reactivate"]),
});

/** Cancel or reactivate a subscription. */
export async function PATCH(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
  }

  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  const { userId, action } = parsed.data;

  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) return NextResponse.json({ error: "اشتراك غير موجود" }, { status: 404 });

  const newStatus = action === "cancel" ? "canceled" : "active";
  const updated = await prisma.subscription.update({
    where: { userId },
    data: { status: newStatus },
  });

  return NextResponse.json({ ok: true, subscription: updated });
}
