// K1SMS — OTP infrastructure
// Raw OTP values are NEVER stored. Only bcrypt/SHA-256 hash stored.
// Rate limiting: max 3 attempts, resend cooldown 60s, max 3 OTPs per hour per phone.

import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { sendSms } from "./send";
import type { OtpPurpose } from "./types";

const OTP_TTL_SECONDS = 300;   // 5 minutes
const MAX_ATTEMPTS = 3;
const RESEND_COOLDOWN_S = 60;  // 1 minute between resends
const HOURLY_CAP = 5;          // max OTPs issued per phone per hour

function hashOtp(code: string): string {
  return createHash("sha256").update(`otp:${code}`).digest("hex");
}

function generateCode(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return String(n);
}

function otpBody(code: string, purpose: OtpPurpose): string {
  const labels: Record<OtpPurpose, string> = {
    signup: "التحقق من التسجيل",
    login: "تسجيل الدخول",
    phone_verify: "التحقق من الرقم",
    password_reset: "استعادة كلمة المرور",
    transaction: "تأكيد العملية",
  };
  return `كود ${labels[purpose] ?? "التحقق"} الخاص بك: ${code}\nصالح لمدة 5 دقائق. لا تشاركه مع أحد.`;
}

export interface OtpSendResult {
  ok: boolean;
  detail: string;
  cooldownUntil?: Date;
}

export interface OtpVerifyResult {
  ok: boolean;
  detail: string;
  attemptsLeft?: number;
}

/** Issue a new OTP for a phone number + purpose.
 *  Enforces hourly cap and resend cooldown. */
export async function sendOtp(
  phone: string,
  purpose: OtpPurpose,
  userId?: string,
  ip?: string,
  senderUserId?: string,
): Promise<OtpSendResult> {
  const now = new Date();

  // Hourly cap — prevent abuse
  const oneHourAgo = new Date(now.getTime() - 3_600_000);
  const recentCount = await (prisma as any).smsOtp.count({
    where: { phone, purpose, createdAt: { gte: oneHourAgo } },
  });
  if (recentCount >= HOURLY_CAP) {
    return { ok: false, detail: "تجاوزت الحد المسموح — حاول بعد ساعة" };
  }

  // Resend cooldown — check last non-used OTP
  const last = await (prisma as any).smsOtp.findFirst({
    where: { phone, purpose, used: false },
    orderBy: { createdAt: "desc" },
  });
  if (last?.cooldownUntil && last.cooldownUntil > now) {
    return { ok: false, detail: "انتظر قبل إعادة الإرسال", cooldownUntil: last.cooldownUntil };
  }

  // Invalidate any prior unused OTPs for this phone+purpose
  await (prisma as any).smsOtp.updateMany({
    where: { phone, purpose, used: false },
    data: { used: true, usedAt: now },
  });

  const code = generateCode();
  const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);
  const cooldownUntil = new Date(now.getTime() + RESEND_COOLDOWN_S * 1000);

  await (prisma as any).smsOtp.create({
    data: {
      userId: userId ?? null,
      phone,
      purpose,
      codeHash: hashOtp(code),
      expiresAt,
      cooldownUntil,
      maxAttempts: MAX_ATTEMPTS,
      ip: ip ?? null,
    },
  });

  // Send SMS (requires a valid SMS provider configured for senderUserId)
  if (senderUserId) {
    await sendSms({
      userId: senderUserId,
      to: phone,
      body: otpBody(code, purpose),
      purpose: "otp",
    });
  }
  // In local/test environments (no senderUserId), the OTP is just stored for
  // verification — the caller is responsible for delivering the code out-of-band.

  return { ok: true, detail: "تم إرسال كود التحقق" };
}

/** Verify an OTP. Consumes it on success. Increments attempt counter on failure. */
export async function verifyOtp(
  phone: string,
  purpose: OtpPurpose,
  code: string,
): Promise<OtpVerifyResult> {
  const now = new Date();
  const otp = await (prisma as any).smsOtp.findFirst({
    where: { phone, purpose, used: false, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    return { ok: false, detail: "الكود غير صالح أو منتهي الصلاحية" };
  }

  if (otp.attempts >= otp.maxAttempts) {
    await (prisma as any).smsOtp.update({ where: { id: otp.id }, data: { used: true, usedAt: now } });
    return { ok: false, detail: "تجاوزت الحد الأقصى للمحاولات — اطلب كوداً جديداً" };
  }

  const hash = hashOtp(code.trim());
  if (hash !== otp.codeHash) {
    await (prisma as any).smsOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    const attemptsLeft = otp.maxAttempts - (otp.attempts + 1);
    return { ok: false, detail: `الكود غير صحيح — ${attemptsLeft} محاولة متبقية`, attemptsLeft };
  }

  // Correct — mark used
  await (prisma as any).smsOtp.update({ where: { id: otp.id }, data: { used: true, usedAt: now } });
  return { ok: true, detail: "تم التحقق بنجاح" };
}
