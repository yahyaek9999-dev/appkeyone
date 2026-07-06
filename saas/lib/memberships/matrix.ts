/** lib/memberships/matrix.ts — full plan comparison matrix (Phase 7) from catalog. */
import { TIERS, capabilitiesForIndex, MONTHLY_BRAIN_CREDITS, MONTHLY_BROADCAST_CREDITS } from "@/lib/pricing/catalog";

export interface MembershipRow {
  slug: string; name: string; price: number | null;
  messages: number; ai: number; broadcasts: number; customers: number; whatsapp: number; team: number;
  brainCredits: number; broadcastCredits: number; apiAccess: boolean; qrAccess: boolean; support: string; capabilities: number;
}

export function getMembershipMatrix(): MembershipRow[] {
  return TIERS.map((t) => {
    const caps = capabilitiesForIndex(t.index);
    return {
      slug: t.slug, name: t.name.en, price: t.priceUsdMonthly,
      messages: t.limits.messages, ai: t.limits.ai, broadcasts: t.limits.broadcasts,
      customers: t.limits.customers, whatsapp: t.limits.whatsapp, team: t.limits.team,
      brainCredits: (MONTHLY_BRAIN_CREDITS as Record<string, number>)[t.slug] ?? 0,
      broadcastCredits: (MONTHLY_BROADCAST_CREDITS as Record<string, number>)[t.slug] ?? 0,
      apiAccess: caps.includes("api_access"),
      qrAccess: t.index >= 1,
      support: t.index >= 5 ? "priority" : t.index >= 3 ? "advanced" : "standard",
      capabilities: caps.length,
    };
  });
}
