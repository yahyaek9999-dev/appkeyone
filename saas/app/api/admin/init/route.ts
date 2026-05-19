/**
 * POST /api/admin/init
 *
 * One-time endpoint to create or promote the first admin user.
 * Protected by ADMIN_INIT_SECRET env variable.
 *
 * Body: { secret: string, email: string, password: string }
 *
 * - If a user with that email exists → promotes them to admin.
 * - If not → creates a new admin user.
 *
 * Blocked entirely once an admin already exists (idempotent-safe).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Body = z.object({
  secret: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
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
      { status: 400 }
    );
  }

  const { secret, email, password } = parsed.data;

  // 2. Validate secret
  const expectedSecret = process.env.ADMIN_INIT_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "السر غلط" }, { status: 403 });
  }

  // 3. Check if an admin already exists
  const existingAdmin = await prisma.user.findFirst({
    where: { role: "admin" } as any,
  });
  if (existingAdmin) {
    return NextResponse.json(
      { error: "يوجد أدمن بالفعل — استخدم لوحة الأدمن لإدارة الصلاحيات" },
      { status: 409 }
    );
  }

  const lowerEmail = email.toLowerCase();

  // 4. Create or promote
  const existingUser = await prisma.user.findUnique({
    where: { email: lowerEmail },
  });

  if (existingUser) {
    // Promote existing user
    await prisma.user.update({
      where: { email: lowerEmail },
      data: { role: "admin" } as any,
    });
    return NextResponse.json({
      ok: true,
      action: "promoted",
      email: lowerEmail,
      message: "تم ترقية المستخدم إلى أدمن بنجاح",
    });
  } else {
    // Create new admin user
    const passwordHash = await hashPassword(password);
    await prisma.user.create({
      data: {
        email: lowerEmail,
        passwordHash,
        name: "Admin",
        role: "admin",
      } as any,
    });
    return NextResponse.json({
      ok: true,
      action: "created",
      email: lowerEmail,
      message: "تم إنشاء حساب الأدمن بنجاح",
    });
  }
}
