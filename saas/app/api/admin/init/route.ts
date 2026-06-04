/**
 * POST /api/admin/init
 *
 * Recovery endpoint — creates OR resets the admin account.
 * Protected by ADMIN_INIT_SECRET env variable.
 *
 * Body: { secret, email, password }
 *
 * Behaviour:
 *  - No admin in DB            → create or promote the given user to admin
 *  - Admin exists, same email  → reset their password to the supplied one
 *  - Admin exists, diff email  → 409 (use the existing admin's email)
 *
 * This lets you recover the admin login even after a DB schema migration
 * wipes or scrambles data, without needing SSH or direct DB access.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Body = z.object({
  secret: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: Request) {
  // 1. Parse body
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "الحقول المطلوبة: secret, email (valid), password (≥8 chars)" },
      { status: 400 },
    );
  }

  const { secret, email, password } = parsed.data;

  // 2. Validate secret
  const expectedSecret = process.env.ADMIN_INIT_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "السر غلط" }, { status: 403 });
  }

  const lowerEmail = email.toLowerCase();
  const passwordHash = await hashPassword(password);

  // 3. Check if an admin already exists
  const existingAdmin = await prisma.user.findFirst({
    where: { role: "admin" } as any,
  });

  // Case A: admin exists and it's the same email → reset password
  if (existingAdmin && (existingAdmin as any).email === lowerEmail) {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: { passwordHash } as any,
    });
    return NextResponse.json({
      ok: true,
      action: "password_reset",
      email: lowerEmail,
      message: "تم إعادة تعيين كلمة مرور الأدمن — يمكنك الدخول الآن",
    });
  }

  // Case B: admin exists but different email → tell them the email
  if (existingAdmin) {
    return NextResponse.json(
      {
        error: "يوجد أدمن بإيميل مختلف — استخدم إيميله أو تواصل مع المطوّر",
        hint: `admin email starts with: ${(existingAdmin as any).email.slice(0, 3)}***`,
      },
      { status: 409 },
    );
  }

  // Case C: no admin at all — create or promote
  const existingUser = await prisma.user.findUnique({
    where: { email: lowerEmail },
  });

  if (existingUser) {
    // Promote existing user + reset password
    await prisma.user.update({
      where: { email: lowerEmail },
      data: { role: "admin", passwordHash } as any,
    });
    return NextResponse.json({
      ok: true,
      action: "promoted",
      email: lowerEmail,
      message: "تم ترقية المستخدم إلى أدمن وتحديث كلمة المرور",
    });
  }

  // Create brand new admin user
  await prisma.user.create({
    data: {
      email: lowerEmail,
      passwordHash,
      name: "Admin",
      role: "admin",
      bot: { create: {} },
    } as any,
  });

  return NextResponse.json({
    ok: true,
    action: "created",
    email: lowerEmail,
    message: "تم إنشاء حساب الأدمن — يمكنك الدخول الآن",
  });
}
