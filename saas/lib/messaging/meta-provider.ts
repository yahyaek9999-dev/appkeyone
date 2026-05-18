/**
 * MetaCloudProvider — Phase 2 implementation.
 *
 * Real Graph API send + delivery ledger + compliance gating. Each public
 * method:
 *   1. Loads + decrypts the merchant's Meta credentials.
 *   2. Runs compliance evaluation (24h window, consent).
 *   3. Calls the Graph API via `meta-api.ts`.
 *   4. Writes a WaMessage ledger row with the resulting state.
 *   5. Maps Graph error codes to our portable ERR codes.
 *
 * Throughout, we never log access tokens or expose them in error payloads.
 */

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto-util";
import {
  ERR,
  type MessagingProvider,
  type ProviderResult,
  type ProviderStatus,
  type SendMediaArgs,
  type SendTemplateArgs,
  type SendTextArgs,
} from "./provider";
import { evaluateOutbound } from "./compliance";
import {
  META_ERR,
  sendMedia as apiSendMedia,
  sendTemplate as apiSendTemplate,
  sendText as apiSendText,
  markRead as apiMarkRead,
} from "./meta-api";

interface MetaCreds {
  phoneNumberId: string;
  token: string;
}

async function loadCreds(userId: string): Promise<MetaCreds | null> {
  const bot = await prisma.bot.findUnique({
    where: { userId },
    select: { metaPhoneNumberId: true, metaAccessTokenEnc: true } as any,
  }) as any;
  if (!bot || !bot.metaPhoneNumberId || !bot.metaAccessTokenEnc) return null;
  try {
    const token = decryptSecret(bot.metaAccessTokenEnc);
    if (!token) return null;
    return { phoneNumberId: bot.metaPhoneNumberId, token };
  } catch {
    return null;
  }
}

function mapMetaError(code: string | undefined): string {
  if (!code) return ERR.UNKNOWN;
  switch (code) {
    case META_ERR.WINDOW_EXPIRED:        return ERR.WINDOW_EXPIRED;
    case META_ERR.TEMPLATE_PAUSED:       return ERR.TEMPLATE_NOT_APPROVED;
    case META_ERR.RATE_LIMITED:          return ERR.RATE_LIMITED;
    case META_ERR.USER_PHONE_INVALID:    return "invalid_recipient";
    case META_ERR.USER_NOT_ON_WHATSAPP:  return "not_on_whatsapp";
    case "timeout":                      return ERR.PROVIDER_DOWN;
    case "network_error":                return ERR.PROVIDER_DOWN;
    default:                             return code;
  }
}

async function recordLedger(args: {
  userId: string;
  to: string;
  body: string;
  kind: "text" | "media" | "template";
  templateName?: string;
  mediaUrl?: string;
  status: "sent" | "failed";
  providerMsgId?: string;
  errorCode?: string;
  errorDetail?: string;
  idempotencyKey?: string;
  conversationId?: string;
}) {
  try {
    await (prisma as any).waMessage.create({
      data: {
        userId: args.userId,
        provider: "meta_cloud",
        conversationId: args.conversationId ?? null,
        customerPhone: args.to,
        direction: "outbound",
        kind: args.kind,
        templateName: args.templateName ?? null,
        body: args.body.slice(0, 4000),
        mediaUrl: args.mediaUrl ?? null,
        status: args.status,
        providerMsgId: args.providerMsgId ?? null,
        idempotencyKey: args.idempotencyKey ?? null,
        errorCode: args.errorCode ?? null,
        errorDetail: args.errorDetail?.slice(0, 500) ?? null,
        sentAt: args.status === "sent" ? new Date() : null,
        failedAt: args.status === "failed" ? new Date() : null,
        attempts: 1,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[meta-provider] ledger write failed:", (e as Error).message);
  }
}

async function recordComplianceBlock(userId: string, to: string, reason: string, detail: string, templateName?: string) {
  try {
    await (prisma as any).waComplianceAudit.create({
      data: {
        userId,
        provider: "meta_cloud",
        severity: "block",
        category: reason.startsWith("consent") ? "consent" : "window_24h",
        action: "blocked",
        customerPhone: to,
        title: `outbound blocked: ${reason}`,
        detail,
        payload: JSON.stringify({ templateName: templateName || null }),
      },
    });
  } catch {}
}

export class MetaCloudProvider implements MessagingProvider {
  readonly name = "meta_cloud" as const;

  async sendMessage(args: SendTextArgs): Promise<ProviderResult> {
    // Idempotency short-circuit.
    if (args.idempotencyKey) {
      const prev = await (prisma as any).waMessage.findUnique({
        where: { idempotencyKey: args.idempotencyKey },
        select: { status: true, providerMsgId: true, errorCode: true, errorDetail: true },
      }).catch(() => null);
      if (prev?.status === "sent") return { ok: true, providerMsgId: prev.providerMsgId ?? undefined };
      if (prev?.status === "failed") return { ok: false, errorCode: prev.errorCode ?? ERR.UNKNOWN, errorDetail: prev.errorDetail ?? undefined };
    }

    const to = args.to.replace(/^\+/, "");
    const creds = await loadCreds(args.userId);
    if (!creds) {
      await recordLedger({ ...args, body: args.text, kind: "text", status: "failed", errorCode: ERR.NOT_CONFIGURED, errorDetail: "Meta credentials missing", to });
      return { ok: false, errorCode: ERR.NOT_CONFIGURED, errorDetail: "Meta credentials missing" };
    }

    // Compliance gate (24h window + consent).
    const decision = await evaluateOutbound({ userId: args.userId, customerPhone: to, provider: "meta_cloud", isTemplate: false });
    if (!decision.allowed) {
      await recordComplianceBlock(args.userId, to, decision.reason, decision.detail);
      await recordLedger({ ...args, body: args.text, kind: "text", status: "failed", errorCode: decision.reason === "consent_revoked" ? ERR.CONSENT_MISSING : ERR.WINDOW_EXPIRED, errorDetail: decision.detail, to });
      return { ok: false, errorCode: decision.reason === "consent_revoked" ? ERR.CONSENT_MISSING : ERR.WINDOW_EXPIRED, errorDetail: decision.detail };
    }

    const r = await apiSendText({ phoneNumberId: creds.phoneNumberId, token: creds.token, to, text: args.text });
    if (r.ok) {
      const providerMsgId = r.data?.messages?.[0]?.id;
      await recordLedger({ ...args, body: args.text, kind: "text", status: "sent", providerMsgId, to });
      return { ok: true, providerMsgId };
    }
    const errorCode = mapMetaError(r.errorCode);
    await recordLedger({ ...args, body: args.text, kind: "text", status: "failed", errorCode, errorDetail: r.errorDetail, to });
    return { ok: false, errorCode, errorDetail: r.errorDetail };
  }

  async sendMedia(args: SendMediaArgs): Promise<ProviderResult> {
    const to = args.to.replace(/^\+/, "");
    const creds = await loadCreds(args.userId);
    if (!creds) return { ok: false, errorCode: ERR.NOT_CONFIGURED };

    const decision = await evaluateOutbound({ userId: args.userId, customerPhone: to, provider: "meta_cloud", isTemplate: false });
    if (!decision.allowed) {
      await recordComplianceBlock(args.userId, to, decision.reason, decision.detail);
      return { ok: false, errorCode: ERR.WINDOW_EXPIRED, errorDetail: decision.detail };
    }

    const r = await apiSendMedia({ phoneNumberId: creds.phoneNumberId, token: creds.token, to, mediaType: args.mediaType, link: args.mediaUrl, caption: args.caption });
    if (r.ok) {
      const providerMsgId = r.data?.messages?.[0]?.id;
      await recordLedger({ userId: args.userId, to, body: args.caption || args.mediaUrl, kind: "media", mediaUrl: args.mediaUrl, status: "sent", providerMsgId, idempotencyKey: args.idempotencyKey, conversationId: args.conversationId });
      return { ok: true, providerMsgId };
    }
    const errorCode = mapMetaError(r.errorCode);
    await recordLedger({ userId: args.userId, to, body: args.caption || args.mediaUrl, kind: "media", mediaUrl: args.mediaUrl, status: "failed", errorCode, errorDetail: r.errorDetail, idempotencyKey: args.idempotencyKey, conversationId: args.conversationId });
    return { ok: false, errorCode, errorDetail: r.errorDetail };
  }

  async sendTemplate(args: SendTemplateArgs): Promise<ProviderResult> {
    const to = args.to.replace(/^\+/, "");
    const creds = await loadCreds(args.userId);
    if (!creds) return { ok: false, errorCode: ERR.NOT_CONFIGURED };

    // Templates allowed outside 24h window — but require opt-in.
    const decision = await evaluateOutbound({ userId: args.userId, customerPhone: to, provider: "meta_cloud", isTemplate: true, templateName: args.templateName });
    if (!decision.allowed) {
      await recordComplianceBlock(args.userId, to, decision.reason, decision.detail, args.templateName);
      return { ok: false, errorCode: ERR.CONSENT_MISSING, errorDetail: decision.detail };
    }

    // Template must be APPROVED in our registry.
    const tpl = await (prisma as any).waTemplate.findUnique({
      where: { userId_name_language: { userId: args.userId, name: args.templateName, language: args.language || "ar" } },
      select: { status: true },
    }).catch(() => null);
    if (!tpl || tpl.status !== "APPROVED") {
      await recordLedger({ userId: args.userId, to, body: args.templateName, kind: "template", templateName: args.templateName, status: "failed", errorCode: ERR.TEMPLATE_NOT_APPROVED, errorDetail: `template status: ${tpl?.status || "unknown"}`, idempotencyKey: args.idempotencyKey });
      return { ok: false, errorCode: ERR.TEMPLATE_NOT_APPROVED, errorDetail: `template status: ${tpl?.status || "unknown"}` };
    }

    const r = await apiSendTemplate({ phoneNumberId: creds.phoneNumberId, token: creds.token, to, templateName: args.templateName, language: args.language || "ar", components: args.components });
    if (r.ok) {
      const providerMsgId = r.data?.messages?.[0]?.id;
      await recordLedger({ userId: args.userId, to, body: args.templateName, kind: "template", templateName: args.templateName, status: "sent", providerMsgId, idempotencyKey: args.idempotencyKey });
      // Bump template usage counter (best-effort).
      await (prisma as any).waTemplate.update({
        where: { userId_name_language: { userId: args.userId, name: args.templateName, language: args.language || "ar" } },
        data: { usageCount: { increment: 1 } },
      }).catch(() => {});
      return { ok: true, providerMsgId };
    }
    const errorCode = mapMetaError(r.errorCode);
    await recordLedger({ userId: args.userId, to, body: args.templateName, kind: "template", templateName: args.templateName, status: "failed", errorCode, errorDetail: r.errorDetail, idempotencyKey: args.idempotencyKey });
    return { ok: false, errorCode, errorDetail: r.errorDetail };
  }

  async markSeen(userId: string, providerMsgId: string): Promise<ProviderResult> {
    const creds = await loadCreds(userId);
    if (!creds) return { ok: false, errorCode: ERR.NOT_CONFIGURED };
    const r = await apiMarkRead({ phoneNumberId: creds.phoneNumberId, token: creds.token, messageId: providerMsgId });
    return r.ok ? { ok: true } : { ok: false, errorCode: mapMetaError(r.errorCode), errorDetail: r.errorDetail };
  }

  async typing(_userId: string, _to: string, _on: boolean): Promise<ProviderResult> {
    // Meta Cloud API doesn't expose a typing indicator. Silent no-op.
    return { ok: true };
  }

  async getStatus(userId: string): Promise<ProviderStatus> {
    const bot = await prisma.bot.findUnique({
      where: { userId },
      select: {
        metaPhoneNumberId: true,
        metaAccessTokenEnc: true,
        metaQualityRating: true,
        metaMessagingLimit: true,
        metaVerifiedAt: true,
      } as any,
    }) as any;
    if (!bot || !bot.metaAccessTokenEnc || !bot.metaPhoneNumberId) {
      return { state: "not_configured", detail: "merchant has not completed Meta Cloud onboarding" };
    }
    return {
      state: bot.metaVerifiedAt ? "connected" : "connecting",
      qualityRating: bot.metaQualityRating ?? undefined,
      messagingLimit: bot.metaMessagingLimit ?? undefined,
    };
  }

  async validateRecipient(_userId: string, _phone: string): Promise<ProviderResult<{ exists: "yes" | "no" | "unknown" }>> {
    // Meta doesn't expose a recipient-pre-check on the Graph API. Always unknown.
    return { ok: true, data: { exists: "unknown" } };
  }
}

export const metaCloudProvider = new MetaCloudProvider();
