/**
 * Hybrid WhatsApp facade.
 *
 * Single import surface for all business-logic call sites:
 *
 *   import { messaging } from "@/lib/messaging";
 *   const r = await messaging.send({ userId, to, text });
 *
 * The facade routes to the right provider based on the merchant's
 * configured connectionMode + plan tier + global flag. Failures of the Meta
 * eligibility check are NEVER hard errors — we fall back to QR. The decision
 * is recorded in WaComplianceAudit so operators can see why a route was taken.
 *
 * QR MIGRATION POLICY:
 *   - Existing direct callers of `wa.send` continue to work.
 *   - New code should call `messaging.send` so it transparently supports Meta
 *     once Phase 2 lands.
 *   - We do NOT remove wa.ts. It's still the QR transport.
 */

import { prisma } from "@/lib/db";
import { metaCloudAllowedForUser } from "./feature-flags";
import { metaCloudProvider } from "./meta-provider";
import { qrProvider } from "./qr-provider";
import type { MessagingProvider, ProviderResult, SendMediaArgs, SendTemplateArgs, SendTextArgs } from "./provider";

async function recordRouteDecision(userId: string, chosen: "qr" | "meta_cloud", reason: string) {
  try {
    await (prisma as any).waComplianceAudit.create({
      data: {
        userId,
        provider: chosen,
        severity: "info",
        category: "policy",
        action: "allowed",
        title: `routed to ${chosen}`,
        detail: `reason=${reason}`,
      },
    });
  } catch {
    // Audit failures must never block a send.
  }
}

export async function resolveProvider(userId: string): Promise<{ provider: MessagingProvider; reason: string }> {
  const eligibility = await metaCloudAllowedForUser(userId);
  if (eligibility.allowed) {
    return { provider: metaCloudProvider, reason: "meta_cloud_eligible" };
  }
  return { provider: qrProvider, reason: `fallback:${eligibility.reason}` };
}

export const messaging = {
  /** Send a plain-text message via the best available provider. */
  async send(args: SendTextArgs): Promise<ProviderResult & { provider: "qr" | "meta_cloud" }> {
    const { provider, reason } = await resolveProvider(args.userId);
    // Only record routing decisions on the FIRST send of a conversation to
    // avoid log spam. Cheap heuristic: emit only when an idempotencyKey is
    // present (i.e. broadcast / system message), not for every chat turn.
    if (args.idempotencyKey) {
      await recordRouteDecision(args.userId, provider.name, reason);
    }
    const r = await provider.sendMessage(args);
    return { ...r, provider: provider.name };
  },

  async sendMedia(args: SendMediaArgs): Promise<ProviderResult & { provider: "qr" | "meta_cloud" }> {
    const { provider } = await resolveProvider(args.userId);
    const r = await provider.sendMedia(args);
    return { ...r, provider: provider.name };
  },

  async sendTemplate(args: SendTemplateArgs): Promise<ProviderResult & { provider: "qr" | "meta_cloud" }> {
    const { provider } = await resolveProvider(args.userId);
    const r = await provider.sendTemplate(args);
    return { ...r, provider: provider.name };
  },

  async getStatus(userId: string) {
    const { provider } = await resolveProvider(userId);
    const s = await provider.getStatus(userId);
    return { provider: provider.name, ...s };
  },
};
