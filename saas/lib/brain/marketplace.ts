/**
 * lib/brain/marketplace.ts — Brain Marketplace (Phase 9). Surfaces the built-in
 * industry brains as listings an admin can enable/disable/price.
 */
import { prisma } from "@/lib/db";
import { listIndustryBrains } from "./industry";

export async function seedMarketplace(): Promise<number> {
  const brains = listIndustryBrains().filter((b) => b.key !== "generic");
  for (const b of brains) {
    await prisma.brainMarketplaceListing.upsert({
      where: { key: String(b.key) },
      create: { key: String(b.key), label: b.label.en, description: b.promptHints, enabled: true, priceUsd: 0 },
      update: { label: b.label.en, description: b.promptHints },
    }).catch(() => {});
  }
  return brains.length;
}

export async function listMarketplace() {
  const rows = await prisma.brainMarketplaceListing.findMany({ orderBy: { key: "asc" } });
  if (rows.length === 0) { await seedMarketplace(); return prisma.brainMarketplaceListing.findMany({ orderBy: { key: "asc" } }); }
  return rows;
}

export async function setMarketplaceListing(key: string, patch: { enabled?: boolean; priceUsd?: number }) {
  const data: any = {};
  if (patch.enabled !== undefined) data.enabled = !!patch.enabled;
  if (patch.priceUsd !== undefined) data.priceUsd = Math.max(0, Number(patch.priceUsd) || 0);
  return prisma.brainMarketplaceListing.update({ where: { key }, data });
}
