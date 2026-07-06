/**
 * lib/whitelabel/resolve.ts — White-label config resolution (Phase 7).
 * Reuses the existing WhiteLabelConfig model (CRUD already at /api/white-label).
 */
import { prisma } from "@/lib/db";

export async function getWhiteLabelConfig(userId: string) {
  return prisma.whiteLabelConfig.findUnique({ where: { userId } }).catch(() => null);
}

export async function listWhiteLabelConfigs(limit = 100) {
  return prisma.whiteLabelConfig.findMany({ orderBy: { updatedAt: "desc" }, take: limit }).catch(() => []);
}
