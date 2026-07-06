/**
 * lib/membership/audit.ts — Membership Isolation audit (Phase 4). Maps every
 * premium capability to the pages + APIs that enforce it (verified in source),
 * so /admin/membership-audit can show isolation coverage at a glance.
 */
import { CAPABILITIES, tierUnlocking } from "@/lib/pricing/catalog";

export interface SurfaceGate {
  capability: string; minTier: string | null; pages: string[]; apis: string[]; comingSoon: boolean; gated: boolean;
}

// Source-verified gate surfaces (pageGate / apiGate present on these).
const PROTECTED: Record<string, { pages: string[]; apis: string[] }> = {
  broadcasts: { pages: ["/dashboard/broadcasts", "/dashboard/broadcasts-pro"], apis: ["/api/broadcasts"] },
  knowledge_base: { pages: ["/dashboard/knowledge"], apis: ["/api/knowledge", "/api/knowledge/[id]", "/api/knowledge/brain", "/api/knowledge/brain/search", "/api/knowledge/import-file", "/api/knowledge/import-products", "/api/knowledge/import-url"] },
  smart_assistant: { pages: ["/dashboard/knowledge-brain", "/dashboard/brain"], apis: ["/api/brain/chat", "/api/brain/classify", "/api/brain/memory", "/api/brain/customer-profile", "/api/brain/lead-score"] },
  sales_pipeline: { pages: ["/dashboard/sales-brain"], apis: [] },
  lead_scoring: { pages: ["/dashboard/leads"], apis: [] },
  customer_segmentation: { pages: ["/dashboard/segments"], apis: ["/api/segments"] },
  advanced_analytics: { pages: ["/dashboard/command-center"], apis: [] },
  revenue_attribution: { pages: ["/dashboard/revenue-forecast"], apis: [] },
  api_access: { pages: ["/dashboard/developer", "/dashboard/developer/docs", "/dashboard/developer/sdk"], apis: ["/api/developer/keys", "/api/developer/usage", "/api/v1/me", "/api/v1/customers"] },
};

export function auditMembershipIsolation(): { capabilities: SurfaceGate[]; totalPages: number; totalApis: number; gatedCount: number; premiumCount: number } {
  const caps = CAPABILITIES.filter((c) => c.minTierIndex > 0);
  const capabilities: SurfaceGate[] = caps.map((c) => {
    const surf = PROTECTED[c.key] || { pages: [], apis: [] };
    const comingSoon = c.comingSoon === true;
    const gated = surf.pages.length > 0 || surf.apis.length > 0 || comingSoon;
    return { capability: c.key, minTier: tierUnlocking(c.key), pages: surf.pages, apis: surf.apis, comingSoon, gated };
  });
  return {
    capabilities,
    totalPages: capabilities.reduce((a, r) => a + r.pages.length, 0),
    totalApis: capabilities.reduce((a, r) => a + r.apis.length, 0),
    gatedCount: capabilities.filter((r) => r.gated).length,
    premiumCount: capabilities.length,
  };
}
