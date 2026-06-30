/**
 * Meta Enterprise — provider registry + failover.
 *
 * A provider-agnostic layer so the platform can support more than one WhatsApp
 * BSP/transport. `meta_cloud` is implemented (it wraps the existing
 * lib/messaging/meta-api health call); additional providers (on-prem / future
 * BSPs) are REGISTERED with clear extension points and report not_configured
 * until wired — that final live integration is READY FOR CONFIGURATION.
 *
 * This layer is metadata + health + failover SELECTION only. It does NOT touch
 * the actual send pipeline (which stays untouched per project policy).
 */

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto-util";
import { getPhoneNumberHealth } from "@/lib/messaging/meta-api";

export interface MetaProviderDef {
  id: string;
  label: string;
  priority: number; // higher = preferred for failover
  implemented: boolean; // false = registered, READY FOR CONFIGURATION
  sendCapable: boolean;
}

export const META_PROVIDERS: MetaProviderDef[] = [
  {
    id: "meta_cloud",
    label: "Meta Cloud API",
    priority: 100,
    implemented: true,
    sendCapable: true,
  },
  {
    id: "meta_onprem",
    label: "Meta On-Premise / BSP",
    priority: 50,
    implemented: false,
    sendCapable: true,
  },
];

export function listProviders(): MetaProviderDef[] {
  return [...META_PROVIDERS].sort((a, b) => b.priority - a.priority);
}

export interface ProviderHealth extends MetaProviderDef {
  configured: boolean;
  healthy: boolean;
  status: string; // not_configured | configured | healthy | error | disabled
  detail?: string | null;
}

/** Per-tenant provider health. The live Graph health call only fires when
 *  META_CLOUD_ENABLED=1 (otherwise we report "configured" without calling). */
export async function getProviderHealth(userId: string): Promise<ProviderHealth[]> {
  const bot = (await prisma.bot.findUnique({
    where: { userId },
    select: { metaPhoneNumberId: true, metaAccessTokenEnc: true } as any,
  })) as any;

  const out: ProviderHealth[] = [];
  for (const p of listProviders()) {
    if (!p.implemented) {
      out.push({
        ...p,
        configured: false,
        healthy: false,
        status: "not_configured",
        detail: "READY FOR CONFIGURATION",
      });
      continue;
    }
    if (p.id === "meta_cloud") {
      const configured = !!(bot?.metaPhoneNumberId && bot?.metaAccessTokenEnc);
      let healthy = false;
      let status = configured ? "configured" : "not_configured";
      let detail: string | null = null;
      if (configured && process.env.META_CLOUD_ENABLED === "1") {
        try {
          const token = decryptSecret(bot.metaAccessTokenEnc);
          const h = await getPhoneNumberHealth({ phoneNumberId: bot.metaPhoneNumberId, token });
          healthy = h.ok;
          status = h.ok ? "healthy" : "error";
          detail = h.ok ? (h.data?.quality_rating ?? null) : (h.errorDetail ?? h.errorCode ?? null);
        } catch (e: any) {
          status = "error";
          detail = String(e?.message || e);
        }
      }
      out.push({ ...p, configured, healthy, status, detail });
    }
  }
  return out;
}

/** Failover selection: highest-priority provider that is configured (and
 *  healthy when known). Returns null when none configured. */
export async function resolveActiveProvider(userId: string): Promise<ProviderHealth | null> {
  const health = await getProviderHealth(userId);
  return health.find((p) => p.configured && p.healthy) || health.find((p) => p.configured) || null;
}
