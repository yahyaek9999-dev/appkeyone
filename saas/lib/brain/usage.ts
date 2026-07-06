/**
 * lib/brain/usage.ts — Brain-credit enforcement + usage logging.
 *
 * Flag-gated (BRAIN_CREDITS_ENABLED). Default OFF → fail-open: Brain works with
 * no credit impact until an operator turns billing on. Mirrors the wallet
 * boundary-gate shape; never throws.
 */
import { prisma } from "@/lib/db";
import { brainFlags } from "./flags";
import { debit, getOrCreateBrainWallet } from "./credits";

export async function brainAllowsCall(userId: string): Promise<{ allowed: boolean; balance: number; reason?: string }> {
  if (!brainFlags.creditsEnabled) return { allowed: true, balance: 0, reason: "credits_off" };
  try {
    const w = await getOrCreateBrainWallet(userId);
    if (w.balance < brainFlags.costPerCall) return { allowed: false, balance: w.balance, reason: "insufficient_credits" };
    return { allowed: true, balance: w.balance };
  } catch {
    return { allowed: true, balance: 0, reason: "error_fail_open" };
  }
}

export async function debitBrainCall(userId: string, channel: string, nonce: string): Promise<number> {
  if (!brainFlags.creditsEnabled) return 0;
  const cost = brainFlags.costPerCall;
  if (cost <= 0) return 0;
  try {
    const res = await debit({
      userId, kind: "usage", amount: cost, source: "brain", reason: `brain:${channel}`,
      idempotencyKey: `brain-usage:${userId}:${nonce}`,
    });
    return res.recorded ? cost : 0;
  } catch {
    return 0;
  }
}

export interface BrainUsageLog {
  userId: string; customerId?: string | null; conversationId?: string | null;
  channel: string; input?: string; output?: string; dialect?: string; industry?: string;
  insights?: string[]; provider?: string; model?: string; creditsUsed?: number; latencyMs?: number; status?: string;
}

export async function trackBrainUsage(data: BrainUsageLog): Promise<void> {
  await prisma.brainMessage.create({
    data: {
      userId: data.userId,
      customerId: data.customerId || null,
      conversationId: data.conversationId || null,
      role: "brain",
      channel: data.channel,
      input: String(data.input || "").slice(0, 4000),
      output: String(data.output || "").slice(0, 8000),
      dialect: data.dialect || "",
      industry: data.industry || "",
      insights: JSON.stringify(data.insights || []),
      provider: data.provider || "",
      model: data.model || "",
      creditsUsed: data.creditsUsed || 0,
      latencyMs: data.latencyMs || 0,
      status: data.status || "ok",
    },
  }).catch(() => {});
}
