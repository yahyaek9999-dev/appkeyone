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

/**
 * Normalize a merchant-typed alert destination to an internationally-routable
 * number. Merchants enter their alert number in LOCAL format ("01097767079");
 * WhatsApp JID resolution (wa-service and Bridge both call getNumberId with the
 * raw digits) cannot resolve a trunk-0 national number, so every such alert
 * failed with "number not registered on WhatsApp" — verified in production:
 * 18/18 queued alerts to a local-format number failed. The merchant's own
 * connected number (always stored international, e.g. "201227704155") tells us
 * the country prefix: strip the trunk 0 and borrow the prefix.
 *
 * Already-international input ("+2010…", "2010…", "0020…") passes through
 * unchanged (digits only). If we cannot derive a sane 1-3 digit prefix, the
 * digits are returned as-is — never worse than the previous behavior.
 */
export function normalizeAlertPhone(
  raw: string,
  connectedWaPhone?: string | null,
): string {
  const phone = String(raw || "").trim();
  const digits = phone.replace(/\D/g, "");
  if (!digits) return phone;
  if (phone.startsWith("+")) return digits;
  if (digits.startsWith("00")) return digits.slice(2);
  if (!digits.startsWith("0")) return digits; // already international
  const wa = String(connectedWaPhone || "").replace(/\D/g, "");
  const national = digits.replace(/^0+/, "");
  if (national && wa.length > national.length) {
    const cc = wa.slice(0, wa.length - national.length);
    if (cc.length >= 1 && cc.length <= 3 && !cc.startsWith("0")) {
      return cc + national;
    }
  }
  return digits;
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

  const connectedPhone = await ownWhatsappPhone(opts.userId);
  const toPhone = normalizeAlertPhone(opts.toPhone, connectedPhone);

  // Self-send guard: never try to deliver an alert to the same WhatsApp
  // number that's hosting the bot — whatsapp-web.js rejects self-sends and
  // the error surfaces as a confusing "send failed" with no destination.
  if (samePhone(connectedPhone, toPhone)) {
    await audit({
      userId: opts.userId,
      level: "warn",
      title: "تعذّر إرسال تنبيه الطلب",
      detail:
        "رقم تنبيه الطلبات هو نفس رقم الواتساب المتصل بالبوت. واتساب لا يسمح بإرسال رسالة لنفس الرقم. " +
        "غيّر رقم التنبيهات في الإعدادات إلى رقمك الشخصي.",
      payload: { toPhone, kind: "order_alert" },
    });
    return { ok: false, channel: "self" };
  }

  const r = await wa.send(opts.userId, toPhone, message, "order_update");
  if (r.ok) return { ok: true, channel: "whatsapp" };

  await audit({
    userId: opts.userId,
    level: "warn",
    title: "فشل إرسال تنبيه الطلب",
    detail: typeof r.data === "string" ? r.data : JSON.stringify(r.data || {}).slice(0, 400),
    payload: { toPhone, kind: "order_alert" },
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

  const connectedPhone = await ownWhatsappPhone(opts.userId);
  const toPhone = normalizeAlertPhone(opts.toPhone, connectedPhone);
  if (samePhone(connectedPhone, toPhone)) {
    await audit({
      userId: opts.userId,
      level: "warn",
      title: "تعذّر إرسال تنبيه",
      detail:
        "رقم التنبيهات هو نفس رقم الواتساب المتصل — واتساب لا يسمح بالإرسال لنفس الرقم. " +
        "غيّر رقم التنبيهات لرقم آخر.",
      payload: { toPhone, kind: opts.category || "admin" },
    });
    return { ok: false, channel: "self" };
  }

  const r = await wa.send(opts.userId, toPhone, opts.text, "system");
  if (r.ok) return { ok: true, channel: "whatsapp" };

  await audit({
    userId: opts.userId,
    level: "warn",
    title: "فشل إرسال تنبيه",
    detail: typeof r.data === "string" ? r.data : JSON.stringify(r.data || {}).slice(0, 400),
    payload: { toPhone, kind: opts.category || "admin" },
  });
  console.warn("[notifyAdmin] failed:", r.data);
  return { ok: false, channel: "log" };
}

/** The bot's connected WhatsApp number for `userId` (null when unknown). */
async function ownWhatsappPhone(userId: string): Promise<string | null> {
  try {
    const bot = await prisma.bot.findUnique({
      where: { userId },
      select: { whatsappPhone: true },
    });
    return bot?.whatsappPhone || null;
  } catch {
    return null;
  }
}

/** True when two numbers match on their trailing 9 digits (+ / cc variance). */
function samePhone(a: string | null, b: string | null): boolean {
  const da = String(a || "").replace(/\D/g, "");
  const db = String(b || "").replace(/\D/g, "");
  if (!da || !db) return false;
  return da.slice(-9) === db.slice(-9);
}
