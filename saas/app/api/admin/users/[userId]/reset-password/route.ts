import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";

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

export async function POST(
  req: Request,
  ctx: { params: { userId: string } }
) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const userId = ctx.params.userId;
  if (!userId) {
    return NextResponse.json({ error: "userId مطلوب" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
  }
  if ((user as any).role === "admin") {
    return NextResponse.json(
      { error: "لا يمكن إعادة تعيين كلمة مرور مدير من هذه الواجهة" },
      { status: 403 }
    );
  }

  const tempPassword = generatePassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    // Bumping passwordChangedAt revokes any existing session token for this
    // user immediately (lib/auth.ts's `pwc` claim check) — an admin-forced
    // password reset now also logs out any device/stolen cookie right away,
    // not just on next natural expiry.
    data: { passwordHash, passwordChangedAt: new Date() },
  });

  void audit({
    userId: user.id, action: "admin.user_password_reset", actorId: actor?.id || null, actorEmail: actor?.email || null, actorRole: "admin",
    targetType: "user", targetId: user.id, metadata: { email: user.email }, req,
  });

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, phone: user.phone },
    tempPassword,
  });
}
