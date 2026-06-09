import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession, createMemberSession } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Precomputed hash used to burn ~equal bcrypt time on unknown-email logins so
// response latency can't be used to enumerate which emails are registered.
const DUMMY_HASH = bcrypt.hashSync("timing-equalization-placeholder", 10);

export async function POST(req: Request) {
  const blocked = enforceRateLimit(req, { name: "login", ...RATE_LIMITS.auth });
  if (blocked) return blocked;
  let json: any;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();

  // 1) Owner account login (the original path).
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return NextResponse.json({ error: "بريد أو كلمة مرور خاطئة" }, { status: 401 });
    }
    // Approval gate for self-service signups awaiting admin activation.
    if ((user as any).approvalStatus === "pending") {
      return NextResponse.json({ error: "حسابك قيد المراجعة. سيتم تفعيله قريباً." }, { status: 403 });
    }
    if ((user as any).approvalStatus === "rejected") {
      return NextResponse.json({ error: "تعذّر تفعيل هذا الحساب. تواصل مع الدعم." }, { status: 403 });
    }
    await createSession(user.id);
    const role = (user as any).role || "user";
    return NextResponse.json({
      ok: true,
      role,
      redirectTo: role === "admin" ? "/admin" : "/dashboard",
    });
  }

  // 2) Team-member login fallback. Members authenticate with their own
  //    credentials but operate inside the owner's workspace.
  const member = await prisma.teamMember.findFirst({
    where: { email, status: "active", passwordHash: { not: null } },
  });
  if (member && member.passwordHash && (await verifyPassword(parsed.data.password, member.passwordHash))) {
    await createMemberSession(member.id);
    await prisma.teamMember.update({
      where: { id: member.id },
      data: { lastLoginAt: new Date() },
    }).catch(() => {});
    return NextResponse.json({ ok: true, role: member.role, redirectTo: "/dashboard" });
  }

  // No bcrypt ran above only when the email matched no owner and no member with
  // a password — equalize timing to avoid leaking account existence.
  if (!user && (!member || !member.passwordHash)) {
    await verifyPassword(parsed.data.password, DUMMY_HASH);
  }

  return NextResponse.json({ error: "بريد أو كلمة مرور خاطئة" }, { status: 401 });
}
