import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { recordMilestone } from "@/lib/activation/track";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

/**
 * Self-serve signup: new accounts activate immediately so a visitor becomes a
 * usable customer without an admin gate (they still pay before using paid limits).
 * Set SIGNUP_AUTO_APPROVE=0 to switch back to manual approval / waitlist.
 */
function autoApprove(): boolean {
  return process.env.SIGNUP_AUTO_APPROVE !== "0";
}

export async function POST(req: Request) {
  const blocked = enforceRateLimit(req, { name: "signup", ...RATE_LIMITS.auth });
  if (blocked) return blocked;

  let json: any;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "تأكد من الاسم والبريد وكلمة مرور لا تقل عن 8 أحرف" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();

  // Block duplicates against BOTH owner accounts and team-member emails so a
  // member email can't later collide with a new owner sign-up.
  const [existingUser, existingMember] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.teamMember.findFirst({ where: { email }, select: { id: true } }),
  ]);
  if (existingUser || existingMember) {
    return NextResponse.json({ error: "هذا البريد مسجّل مسبقاً" }, { status: 409 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const approved = autoApprove();

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email,
        name: parsed.data.name,
        passwordHash,
        role: "user",
        approvalStatus: approved ? "approved" : "pending",
        approvedAt: approved ? new Date() : null,
        approvedBy: approved ? "auto" : null,
        // The owner's workspace = their auto-created Bot (no subscription → free tier).
        bot: { create: {} },
      } as any,
    });
  } catch (e: any) {
    // Concurrent signup with the same email can slip past the pre-check above and
    // hit the unique constraint — return the same 409 rather than a raw 500.
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "هذا البريد مسجّل مسبقاً" }, { status: 409 });
    }
    throw e;
  }

  // Activation funnel: first milestone. Fire-and-forget — never blocks signup.
  recordMilestone(user.id, "signed_up", { approved }).catch(() => {});

  if (approved) {
    await createSession(user.id);
    return NextResponse.json({ ok: true, status: "approved", redirectTo: "/onboarding" });
  }

  // Waitlist mode: no session until an admin approves.
  return NextResponse.json({
    ok: true,
    status: "pending",
    message: "تم استلام طلبك! سيتم مراجعة الحساب وتفعيله قريباً.",
  });
}
