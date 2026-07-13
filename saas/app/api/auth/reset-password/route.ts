/**
 * Complete a password reset.
 *
 *   POST /api/auth/reset-password  { token, password }
 *
 * Validates the raw token against the stored sha256 hash + expiry, sets a
 * new passwordHash, and clears the token (single-use). Atomic on the token
 * hash still matching so two concurrent submits of the same link can't both
 * succeed — mirrors accept-invite's updateMany race guard.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
});

function sha256(v: string) {
  return createHash("sha256").update(v).digest("hex");
}

export async function POST(req: Request) {
  const blocked = enforceRateLimit(req, { name: "reset-password", ...RATE_LIMITS.auth });
  if (blocked) return blocked;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "تأكد من الرابط وكلمة مرور لا تقل عن 8 أحرف" }, { status: 400 });
  }

  const tokenHash = sha256(parsed.data.token);
  const user = await prisma.user.findFirst({
    where: { resetTokenHash: tokenHash },
    select: { id: true, resetExpiresAt: true, deletedAt: true },
  });

  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "رابط إعادة التعيين غير صالح" }, { status: 400 });
  }
  if (!user.resetExpiresAt || user.resetExpiresAt < new Date()) {
    return NextResponse.json({ error: "انتهت صلاحية الرابط. اطلب رابطًا جديدًا." }, { status: 410 });
  }

  const result = await prisma.user.updateMany({
    where: { id: user.id, resetTokenHash: tokenHash },
    data: {
      passwordHash: await hashPassword(parsed.data.password),
      resetTokenHash: null,
      resetExpiresAt: null,
    },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "رابط إعادة التعيين غير صالح" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, redirectTo: "/login" });
}
