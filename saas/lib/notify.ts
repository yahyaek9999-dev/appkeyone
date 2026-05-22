// Merchant-facing notifications: order alerts, anger alerts, generic admin
// notices. Every send (success or failure) is persisted to SafetyAudit so the
// merchant can see WHY a notification didn't reach them in the admin dashboard
// — previously failures went to console only and disappeared on restart.
//
// Phone resolution chain when callers don't supply a destination:
//   bot.notifyPhone → bot.whatsappPhone → user.phone
// This matches the daily-report cron's behavior so all alert paths agree.

import { wa } from "./wa";
import { prisma } from "./db";

async function audit(opts: {
  userId?: string | null;
  level: "info" | "warn" | "critical";
  title: string;
  detail?: string;
  payload?: Record<string, any>;
}) {
  try {
    await prisma.safetyAudit.create({
      data: {
        userId: opts.userId || null,
        level: opts.level,
        category: "notify",
        title: opts.title,
        detail: opts.detail || "",
        payload: JSON.stringify(opts.payload || {}),
      },
    });
  } catch {
    // never let observability break the request path
  }
}

/**
 * Resolve the best phone to deliver an alert to. Uses the bot's notifyPhone
 * if set, then the connected WhatsApp number, then the merchant's account
 * phone. Returns null if no destination is available.
 *
 * The userId form is preferred — callers that already have a phone in hand
 * can use sendNotification() directly.
 */
export async function resolveNotifyPhone(userId: string): Promise<string | null> {
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, bot: { select: { notifyPhone: true, whatsappPhone: true } } },
    });
    if (!u) return null;
    return u.bot?.notifyPhone || u.bot?.whatsappPhone || u.phone || null;
  } catch {
    return null;
  }
}

export async function notifyMerchant(opts: {
  userId?: string; // owner's user id (needed for multi-tenant whatsapp send)
  toPhone: string;
  fromCustomer: { name?: string | null; phone: string };
  text: string;
}) {
  const message = `🔔 *تنبيه طلب جديد*\nالعميل: ${
    opts.fromCustomer.name || "بدون اسم"
  }\nالرقم: ${opts.fromCustomer.phone}\nالرسالة: ${opts.text.slice(0, 500)}`;

  if (!opts.userId) {
    console.log("[NOTIFY] no userId, fallback log only:", opts.toPhone);
    return { ok: false, channel: "log" };
  }

  // Self-send guard: never try to deliver an alert to the same WhatsApp
  // number that's hosting the bot — whatsapp-web.js rejects self-sends and
  // the error surfaces as a confusing "send failed" with no destination.
  const sameWaNumber = await isOwnWhatsappNumber(opts.userId, opts.toPhone);
  if (sameWaNumber) {
    await audit({
      userId: opts.userId,
      level: "warn",
      title: "تعذّر إرسال تنبيه الطلب",
      detail:
        "رقم تنبيه الطلبات هو نفس رقم الواتساب المتصل بالبوت. واتساب لا يسمح بإرسال رسالة لنفس الرقم. " +
        "غيّر رقم التنبيهات في الإعدادات إلى رقمك الشخصي.",
      payload: { toPhone: opts.toPhone, kind: "order_alert" },
    });
    return { ok: false, channel: "self" };
  }

  const r = await wa.send(opts.userId, opts.toPhone, message, "order_update");
  if (r.ok) return { ok: true, channel: "whatsapp" };

  await audit({
    userId: opts.userId,
    level: "warn",
    title: "فشل إرسال تنبيه الطلب",
    detail: typeof r.data === "string" ? r.data : JSON.stringify(r.data || {}).slice(0, 400),
    payload: { toPhone: opts.toPhone, kind: "order_alert" },
  });
  console.warn("[notify] whatsapp send failed:", r.data);
  return { ok: false, channel: "log" };
}

/** Generic admin alert sender (anger, follow-up failures, etc). */
export async function notifyAdmin(opts: {
  userId: string;
  toPhone: string;
  text: string;
  category?: string; // free-form label for the audit log (e.g. "anger", "broadcast")
}) {
  if (!opts.toPhone) {
    await audit({
      userId: opts.userId,
      level: "warn",
      title: "تعذّر إرسال تنبيه (لا يوجد رقم)",
      detail: "حدّد رقم تنبيهات في الإعدادات حتى يصلك التنبيه.",
      payload: { kind: opts.category || "admin" },
    });
    return { ok: false, channel: "none" };
  }

  const sameWaNumber = await isOwnWhatsappNumber(opts.userId, opts.toPhone);
  if (sameWaNumber) {
    await audit({
      userId: opts.userId,
      level: "warn",
      title: "تعذّر إرسال تنبيه",
      detail:
        "رقم التنبيهات هو نفس رقم الواتساب المتصل — واتساب لا يسمح بالإرسال لنفس الرقم. " +
        "غيّر رقم التنبيهات لرقم آخر.",
      payload: { toPhone: opts.toPhone, kind: opts.category || "admin" },
    });
    return { ok: false, channel: "self" };
  }

  const r = await wa.send(opts.userId, opts.toPhone, opts.text, "system");
  if (r.ok) return { ok: true, channel: "whatsapp" };

  await audit({
    userId: opts.userId,
    level: "warn",
    title: "فشل إرسال تنبيه",
    detail: typeof r.data === "string" ? r.data : JSON.stringify(r.data || {}).slice(0, 400),
    payload: { toPhone: opts.toPhone, kind: opts.category || "admin" },
  });
  console.warn("[notifyAdmin] failed:", r.data);
  return { ok: false, channel: "log" };
}

/** True if `phone` matches the bot's connected whatsappPhone (digits only). */
async function isOwnWhatsappNumber(userId: string, phone: string): Promise<boolean> {
  try {
    const bot = await prisma.bot.findUnique({
      where: { userId },
      select: { whatsappPhone: true },
    });
    if (!bot?.whatsappPhone || !phone) return false;
    const a = bot.whatsappPhone.replace(/\D/g, "");
    const b = phone.replace(/\D/g, "");
    if (!a || !b) return false;
    // Compare on the trailing 9 digits (covers + / country-code variance).
    return a.slice(-9) === b.slice(-9);
  } catch {
    return false;
  }
}
