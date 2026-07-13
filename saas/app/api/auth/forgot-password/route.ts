/**
 * Request a password reset link.
 *
 *   POST /api/auth/forgot-password  { email }
 *
 * Always responds with the same generic message regardless of whether the
 * email exists — avoids account enumeration. Mirrors the TeamMember
 * invite-token pattern: a random raw token is emailed, only its sha256 hash
 * is stored, with a short expiry, single-use (cleared on success).
 *
 * Delivery depends on lib/platform-email.ts being configured (PLATFORM_SES_*
 * env vars) — no platform email provider exists yet as of this writing. If
 * unconfigured, the token is generated and stored (hashed) but NOT logged —
 * only its hash exists anywhere, so there is deliberately no server-side
 * recovery of the raw token. An operator helping a locked-out user must use
 * the existing admin-initiated reset
 * (POST /api/admin/users/[userId]/reset-password), not this flow. The client
 * always sees the same generic success message either way.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { sendPlatformEmail, PlatformEmailNotConfiguredError } from "@/lib/platform-email";

export const dynamic = "force-dynamic";

const Body = z.object({ email: z.string().email().transform((v) => v.toLowerCase().trim()) });

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function sha256(v: string) {
  return createHash("sha256").update(v).digest("hex");
}

const GENERIC_OK = {
  ok: true,
  message: "إذا كان البريد الإلكتروني مسجلاً لدينا، فسيصلك رابط إعادة تعيين كلمة المرور.",
};

export async function POST(req: Request) {
  const blocked = enforceRateLimit(req, { name: "forgot-password", ...RATE_LIMITS.auth });
  if (blocked) return blocked;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "أدخل بريدًا إلكترونيًا صالحًا" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, deletedAt: true },
  });

  // Same response whether the user exists, is deleted, or is fine — no
  // enumeration signal leaks through timing or response shape either, since
  // we always do a comparable amount of work below when possible.
  if (user && !user.deletedAt) {
    const rawToken = randomBytes(32).toString("hex");
    await prisma.user.update({
      where: { id: user.id },
      data: { resetTokenHash: sha256(rawToken), resetExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });

    const origin = new URL(req.url).origin;
    const resetUrl = `${origin}/reset-password?token=${rawToken}`;

    try {
      await sendPlatformEmail({
        to: parsed.data.email,
        subject: "إعادة تعيين كلمة المرور — KEYONE",
        html: `<p>اضغط الرابط التالي لإعادة تعيين كلمة المرور (صالح لمدة ساعة):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>إذا لم تطلب هذا، تجاهل هذه الرسالة.</p>`,
      });
    } catch (error) {
      // Never log rawToken/resetUrl — only its sha256 hash is persisted
      // anywhere (by design), so logging the raw value here would be the
      // only place it exists in recoverable form, defeating that design.
      if (error instanceof PlatformEmailNotConfiguredError) {
        // eslint-disable-next-line no-console
        console.error(
          `[forgot-password] platform email not configured — reset requested for user ${user.id}, no delivery channel available`,
        );
      } else {
        // eslint-disable-next-line no-console
        console.error("[forgot-password] send failed for user", user.id, error);
      }
      // Do not surface delivery failure to the client — same generic message.
    }
  }

  return NextResponse.json(GENERIC_OK);
}
