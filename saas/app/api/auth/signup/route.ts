import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

/** When SIGNUP_AUTO_APPROVE=1, new accounts activate immediately (no waitlist). */
function autoApprove(): boolean {
  return process.env.SIGNUP_AUTO_APPROVE === "1";
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

  const user = await prisma.user.create({
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
