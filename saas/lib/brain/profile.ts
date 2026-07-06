/**
 * lib/brain/profile.ts — brain-computed lead score + customer profile read.
 * Heuristic (no LLM): combines existing CRM signals with Brain classifications.
 */
import { prisma } from "@/lib/db";
import type { Classification } from "./classify";

export function computeLeadScore(input: { baseScore?: number; insights: Classification[]; orderCount?: number }): number {
  let s = Math.max(0, Math.min(100, input.baseScore ?? 30));
  for (const i of input.insights) {
    if (i.type === "BUYING_SIGNAL") s += 25 * i.score;
    else if (i.type === "VIP_CUSTOMER") s += 15;
    else if (i.type === "RETURNING_CUSTOMER") s += 10;
    else if (i.type === "PRICE_OBJECTION") s -= 5;
    else if (i.type === "ANGRY_CUSTOMER") s -= 12;
    else if (i.type === "FOLLOWUP_REQUIRED") s -= 3;
  }
  s += Math.min(20, (input.orderCount ?? 0) * 5);
  return Math.max(0, Math.min(100, Math.round(s)));
}

/** Read a customer's Brain profile + memory + recent insights (tenant-scoped). */
export async function getCustomerBrainProfile(userId: string, customerId: string) {
  const [profile, memory, insights] = await Promise.all([
    prisma.brainProfile.findFirst({ where: { customerId, userId } }),
    prisma.brainMemory.findFirst({ where: { customerId, userId } }),
    prisma.brainInsight.findMany({ where: { userId, customerId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return { profile, memory, insights };
}
