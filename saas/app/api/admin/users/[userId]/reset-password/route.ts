import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

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
  _req: Request,
  ctx: { params: { userId: string } }
) {
  try {
    await requireAdmin();
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
    data: { passwordHash },
  });

  // Sessions are JWT-based with 30d expiry; cannot be revoked centrally.
  // Customer must be told the password change forces them to re-login on
  // their next session expiry — we surface this in the UI message.

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, phone: user.phone },
    tempPassword,
  });
}
