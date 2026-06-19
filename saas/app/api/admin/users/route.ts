import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      subscription: { include: { plan: true } },
      _count: { select: { customers: true, documents: true } },
    },
  });

  return NextResponse.json({
    users: users.map((u: any) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      phone: u.phone,
      role: u.role,
      createdAt: u.createdAt,
      customers: u._count.customers,
      documents: u._count.documents,
      subscription: u.subscription
        ? {
            id: u.subscription.id,
            status: u.subscription.status,
            planName: u.subscription.plan.name,
            planSlug: u.subscription.plan.slug,
            startedAt: u.subscription.startedAt,
            expiresAt: u.subscription.expiresAt,
            msgsUsed: u.subscription.msgsUsed,
            monthlyMsgs: u.subscription.plan.monthlyMsgs,
            billingCycle: u.subscription.billingCycle,
            paymentRef: u.subscription.paymentRef,
            adminNote: u.subscription.adminNote,
          }
        : null,
    })),
  });
}

/**
 * Generate a memorable but strong temp password.
 * Format: 2 lowercase words + 4 digits + symbol. Example: lion-falcon-7239!
 */
function generatePassword(): string {
  const words = [
    "lion", "falcon", "tiger", "eagle", "nile", "amber",
    "ivory", "delta", "ruby", "olive", "cedar", "ocean",
    "shore", "atlas", "noble", "swift", "maple", "vivid",
  ];
  const w1 = words[Math.floor(Math.random() * words.length)];
  let w2 = words[Math.floor(Math.random() * words.length)];
  while (w2 === w1) w2 = words[Math.floor(Math.random() * words.length)];
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  const sym = ["!", "@", "#", "$"][Math.floor(Math.random() * 4)];
  return `${w1}-${w2}-${digits}${sym}`;
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim() || null;
  const phone = String(body.phone || "").trim() || null;
  const planSlug = String(body.planSlug || "").trim() || null;
  const billingCycle = body.billingCycle === "yearly" ? "yearly" : "monthly";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "بريد إلكتروني غير صالح" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "هذا البريد مسجّل مسبقاً" }, { status: 409 });
  }

  const tempPassword = generatePassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const user = await prisma.user.create({
    data: {
      email,
      name,
      phone,
      passwordHash,
      role: "user",
      bot: { create: {} },
    } as any,
  });

  let subscriptionInfo: any = null;
  if (planSlug) {
    const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
    // Never assign an archived/legacy plan — only current plans are sellable.
    if (plan && (plan as any).status === "archived") {
      return NextResponse.json({ error: "plan_archived", message: "هذه الباقة مؤرشفة ولا يمكن إسنادها — اختر باقة حالية." }, { status: 400 });
    }
    if (plan) {
      const days = billingCycle === "yearly" ? 365 : 30;
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const sub = await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          status: "active",
          startedAt: new Date(),
          expiresAt,
          msgsUsed: 0,
          billingCycle,
          adminNote: "Created by admin",
        } as any,
      });
      subscriptionInfo = {
        planName: plan.name,
        billingCycle,
        expiresAt: sub.expiresAt,
      };
    }
  }

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, phone: user.phone },
    tempPassword,
    subscription: subscriptionInfo,
  });
}
