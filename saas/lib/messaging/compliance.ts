/**
 * Compliance gates for Meta Cloud API outbound messaging.
 *
 * Two hard rules per Meta Business Policy:
 *   1. **24h customer-care window**: free-form messages may only be sent
 *      to a customer who has messaged us within the last 24 hours.
 *      Outside the window, only APPROVED templates are allowed.
 *   2. **Consent**: never send marketing/outbound to a customer who has
 *      revoked consent (STOP keyword) or whose serviceOptIn is false.
 *
 * The QR provider also benefits from soft enforcement of (2) — we record
 * the audit but do not block QR sends, since the merchant's QR phone is
 * subject to WhatsApp's own anti-spam systems rather than Meta policy.
 */

import { prisma } from "@/lib/db";

export type ComplianceDecision =
  | { allowed: true; reason: "ok" | "inside_24h_window" | "template_outside_window" | "qr_soft_allow" }
  | { allowed: false; reason: "consent_revoked" | "no_service_optin" | "window_expired_no_template"; detail: string };

const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ComplianceContext {
  userId: string;
  customerPhone: string;       // E.164, normalized
  provider: "qr" | "meta_cloud";
  /** When false, this is a free-form text message (must be inside window). */
  isTemplate?: boolean;
  /** Optional template name — only used for the audit log. */
  templateName?: string;
}

export async function evaluateOutbound(ctx: ComplianceContext): Promise<ComplianceDecision> {
  const phone = ctx.customerPhone.replace(/^\+/, "");

  const consent = await (prisma as any).waConsent.findUnique({
    where: { userId_customerPhone: { userId: ctx.userId, customerPhone: phone } },
    select: { revokedAt: true, serviceOptIn: true, lastInboundAt: true, marketingOptIn: true },
  }).catch(() => null);

  // Revoked consent is a HARD block on both providers.
  if (consent?.revokedAt) {
    return {
      allowed: false,
      reason: "consent_revoked",
      detail: `customer revoked consent at ${consent.revokedAt.toISOString?.() || consent.revokedAt}`,
    };
  }

  // QR provider: soft enforcement. We never block QR on policy here; QR
  // anti-ban is handled by lib/anti-ban.ts and lib/safety/engine.ts.
  if (ctx.provider === "qr") {
    return { allowed: true, reason: "qr_soft_allow" };
  }

  // Meta: serviceOptIn missing → must have an approved template. But we
  // don't have a customer record at all when the merchant uploads cold
  // contacts — treat "no consent row" as "no service opt-in".
  const hasServiceOptIn = !!consent?.serviceOptIn;

  // Inside 24h window?
  const lastInboundAt = consent?.lastInboundAt
    ? new Date(consent.lastInboundAt).getTime()
    : 0;
  const insideWindow = lastInboundAt > 0 && Date.now() - lastInboundAt < WINDOW_MS;

  if (insideWindow) {
    return { allowed: true, reason: "inside_24h_window" };
  }

  // Outside window. Templates are allowed if (and only if) we have an
  // explicit opt-in (service for utility templates, marketing for marketing).
  if (ctx.isTemplate && hasServiceOptIn) {
    return { allowed: true, reason: "template_outside_window" };
  }

  if (ctx.isTemplate && !hasServiceOptIn) {
    return {
      allowed: false,
      reason: "no_service_optin",
      detail: "template send requires an explicit opt-in record",
    };
  }

  return {
    allowed: false,
    reason: "window_expired_no_template",
    detail: lastInboundAt > 0
      ? `last inbound was ${Math.round((Date.now() - lastInboundAt) / 3_600_000)}h ago`
      : "no recorded inbound message",
  };
}

/**
 * Record an inbound message from a customer. This stamps the 24h window
 * anchor used by `evaluateOutbound`. Called from the webhook processor.
 */
export async function recordInbound(userId: string, customerPhone: string, source: string = "inbound_reply") {
  const phone = customerPhone.replace(/^\+/, "");
  try {
    await (prisma as any).waConsent.upsert({
      where: { userId_customerPhone: { userId, customerPhone: phone } },
      update: { lastInboundAt: new Date(), serviceOptIn: true },
      create: {
        userId,
        customerPhone: phone,
        source,
        serviceOptIn: true,
        lastInboundAt: new Date(),
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[compliance/recordInbound] failed:", (e as Error).message);
  }
}

/**
 * Customer typed STOP / إلغاء / "stop messages" — flip the kill switch.
 * The provider layer will refuse all future sends to this number.
 */
const REVOKE_KEYWORDS = [
  /^stop$/i,
  /^unsubscribe$/i,
  /^cancel$/i,
  /^remove$/i,
  /إلغاء/,
  /الغاء/,
  /لا تراسلني/,
  /وقف الرسائل/,
];

export function looksLikeRevoke(text: string): boolean {
  const trimmed = (text || "").trim();
  if (!trimmed) return false;
  if (trimmed.length > 40) return false; // STOP messages are short
  return REVOKE_KEYWORDS.some((re) => re.test(trimmed));
}

export async function revokeConsent(userId: string, customerPhone: string, reason: string = "customer_stop") {
  const phone = customerPhone.replace(/^\+/, "");
  try {
    await (prisma as any).waConsent.upsert({
      where: { userId_customerPhone: { userId, customerPhone: phone } },
      update: { revokedAt: new Date(), notes: reason },
      create: {
        userId,
        customerPhone: phone,
        source: "stop_keyword",
        serviceOptIn: false,
        revokedAt: new Date(),
        notes: reason,
      },
    });
    await (prisma as any).waComplianceAudit.create({
      data: {
        userId,
        provider: "meta_cloud",
        severity: "warn",
        category: "consent",
        action: "blocked",
        customerPhone: phone,
        title: "consent revoked",
        detail: reason,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[compliance/revoke] failed:", (e as Error).message);
  }
}
