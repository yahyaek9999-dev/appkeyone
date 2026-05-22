/**
 * QRProvider — thin wrapper over the existing whatsapp-web.js micro-service.
 *
 * IMPORTANT: This file MUST NOT change the semantics of the underlying
 * `lib/wa.ts` helpers. It only adapts them to the `MessagingProvider`
 * interface and writes a ledger row to `WaMessage` so downstream analytics
 * and dashboards have a single source of truth.
 *
 * Every existing caller (broadcasts, daily-report, shipment-notify, etc.)
 * keeps working unchanged because we don't remove `wa.send` — we just give
 * the new code a richer entry point.
 */

import { prisma } from "@/lib/db";
import { wa } from "@/lib/wa";
import {
  ERR,
  type MessagingProvider,
  type ProviderResult,
  type ProviderStatus,
  type SendMediaArgs,
  type SendTemplateArgs,
  type SendTextArgs,
} from "./provider";

async function recordLedger(
  args: SendTextArgs,
  status: "sent" | "failed",
  extras: { providerMsgId?: string; errorCode?: string; errorDetail?: string }
) {
  try {
    await (prisma as any).waMessage.create({
      data: {
        userId: args.userId,
        provider: "qr",
        conversationId: args.conversationId ?? null,
        customerPhone: args.to,
        direction: "outbound",
        kind: "text",
        body: args.text.slice(0, 4000),
        status,
        providerMsgId: extras.providerMsgId ?? null,
        idempotencyKey: args.idempotencyKey ?? null,
        errorCode: extras.errorCode ?? null,
        errorDetail: extras.errorDetail?.slice(0, 500) ?? null,
        sentAt: status === "sent" ? new Date() : null,
        failedAt: status === "failed" ? new Date() : null,
        attempts: 1,
      },
    });
  } catch (e) {
    // Ledger failures must NEVER affect the send result. We swallow and log.
    // (A duplicate idempotencyKey hit lands here too — that's fine.)
    // eslint-disable-next-line no-console
    console.error("[qr-provider] ledger write failed:", (e as Error).message);
  }
}

export class QRProvider implements MessagingProvider {
  readonly name = "qr" as const;

  async sendMessage(args: SendTextArgs): Promise<ProviderResult> {
    // Idempotency short-circuit: if the caller supplied a key and we already
    // recorded a successful send under it, return the previous result.
    if (args.idempotencyKey) {
      const prev = await (prisma as any).waMessage.findUnique({
        where: { idempotencyKey: args.idempotencyKey },
        select: { status: true, providerMsgId: true, errorCode: true, errorDetail: true },
      }).catch(() => null);
      if (prev && prev.status === "sent") {
        return { ok: true, providerMsgId: prev.providerMsgId ?? undefined };
      }
      if (prev && prev.status === "failed") {
        return { ok: false, errorCode: prev.errorCode ?? ERR.UNKNOWN, errorDetail: prev.errorDetail ?? undefined };
      }
    }

    const r = await wa.sendNow(args.userId, args.to, args.text);
    if (r.ok) {
      const providerMsgId = (r as any)?.data?.id || (r as any)?.data?.messageId || undefined;
      await recordLedger(args, "sent", { providerMsgId });
      return { ok: true, providerMsgId, data: r.data };
    }
    const errorDetail = typeof r.data === "string"
      ? r.data
      : JSON.stringify(r.data || {}).slice(0, 500);
    await recordLedger(args, "failed", { errorCode: ERR.PROVIDER_DOWN, errorDetail });
    return { ok: false, errorCode: ERR.PROVIDER_DOWN, errorDetail, data: r.data };
  }

  async sendMedia(_args: SendMediaArgs): Promise<ProviderResult> {
    // The current wa.ts surface doesn't expose media yet. We return a clear
    // NOT_SUPPORTED so callers can choose to fall back to text-with-link.
    return { ok: false, errorCode: ERR.NOT_SUPPORTED, errorDetail: "QR provider does not yet expose media send" };
  }

  async sendTemplate(_args: SendTemplateArgs): Promise<ProviderResult> {
    return { ok: false, errorCode: ERR.NOT_SUPPORTED, errorDetail: "templates are Meta Cloud only" };
  }

  async markSeen(_userId: string, _providerMsgId: string): Promise<ProviderResult> {
    return { ok: true, data: { skipped: true } }; // QR layer handles this implicitly
  }

  async typing(_userId: string, _to: string, _on: boolean): Promise<ProviderResult> {
    return { ok: true, data: { skipped: true } };
  }

  async getStatus(userId: string): Promise<ProviderStatus> {
    const r = await wa.status(userId);
    if (!r.ok) return { state: "unknown", detail: "wa-service unreachable" };
    const s = (r.data as any)?.status || "unknown";
    return { state: s };
  }

  async validateRecipient(_userId: string, _phone: string): Promise<ProviderResult<{ exists: "yes" | "no" | "unknown" }>> {
    // QR doesn't expose a recipient-validation API. Treat as unknown.
    return { ok: true, data: { exists: "unknown" } };
  }
}

export const qrProvider = new QRProvider();
