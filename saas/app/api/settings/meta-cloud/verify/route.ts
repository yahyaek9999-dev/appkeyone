/**
 * POST /api/settings/meta-cloud/verify
 *
 * Owner-triggered "Test connection" for Meta Cloud. Closes the gap where an
 * owner saved credentials blind and had to wait up to an hour for the
 * meta-quality-monitor cron to confirm (or silently fail).
 *
 * It runs the SAME read-only health check the cron already uses
 * (getPhoneNumberHealth → GET graph.facebook.com/{phoneNumberId}) against the
 * stored, encrypted credentials, and applies the SAME Bot writes
 * (metaQualityRating / metaMessagingLimit / metaVerifiedAt). It returns an
 * immediate pass/fail so the owner gets inline feedback.
 *
 * This is configuration/visibility only — it does NOT touch the WhatsApp send
 * pipeline (no message is dispatched; it reads phone-number metadata).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto-util";
import { getPhoneNumberHealth } from "@/lib/messaging/meta-api";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { audit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let user;
  try { user = await requirePermission("settings"); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const limited = enforceRateLimit(req, { name: "meta-verify", ...RATE_LIMITS.api });
  if (limited) return limited;

  const bot = await prisma.bot.findUnique({ where: { userId: user.id } }) as any;
  if (!bot) return NextResponse.json({ ok: false, reason: "not_configured", message: "البوت غير مهيأ." }, { status: 400 });

  const phoneNumberId = bot.metaPhoneNumberId || "";
  if (!phoneNumberId || !bot.metaAccessTokenEnc) {
    return NextResponse.json({ ok: false, reason: "not_configured", message: "أدخل Phone Number ID ورمز الوصول واحفظ أولاً ثم تحقّق." }, { status: 400 });
  }

  let token = "";
  try { token = decryptSecret(bot.metaAccessTokenEnc); } catch { /* corrupt cipher */ }
  if (!token) {
    return NextResponse.json({ ok: false, reason: "token_unreadable", message: "تعذّر قراءة رمز الوصول المخزّن — أعد إدخاله واحفظ." }, { status: 400 });
  }

  const r = await getPhoneNumberHealth({ phoneNumberId, token });
  if (!r.ok) {
    // Bad/expired token, wrong phone id, or Meta-side error. Do NOT stamp
    // verifiedAt — surface the reason so the owner can fix it now.
    await audit({
      userId: user.id, action: "settings.meta_cloud_verified", actorId: user.id,
      actorEmail: (user as any).email || null, actorRole: (user as any).role || "owner",
      targetType: "meta_cloud", targetId: phoneNumberId,
      metadata: { result: "failed", detail: (r as any).errorDetail || null },
    });
    return NextResponse.json({
      ok: false, reason: "invalid",
      message: "فشل التحقّق — تأكّد من صحة Phone Number ID ورمز الوصول وأنه غير منتهي.",
      detail: (r as any).errorDetail || null,
    });
  }

  const quality = r.data?.quality_rating || null;
  const tier = r.data?.messaging_limit_tier || null;

  await prisma.bot.update({
    where: { userId: user.id },
    data: {
      metaQualityRating: quality,
      metaMessagingLimit: tier,
      metaVerifiedAt: new Date(),
    } as any,
  }).catch(() => {});

  await audit({
    userId: user.id, action: "settings.meta_cloud_verified", actorId: user.id,
    actorEmail: (user as any).email || null, actorRole: (user as any).role || "owner",
    targetType: "meta_cloud", targetId: phoneNumberId,
    metadata: { result: "ok", quality, tier, displayPhone: r.data?.display_phone_number || null },
  });

  return NextResponse.json({
    ok: true,
    quality,
    tier,
    displayPhone: r.data?.display_phone_number || null,
    nameStatus: r.data?.name_status || null,
    verifiedAt: new Date().toISOString(),
    message: "تم التحقّق بنجاح — الاتصال بـ Meta يعمل.",
  });
}
