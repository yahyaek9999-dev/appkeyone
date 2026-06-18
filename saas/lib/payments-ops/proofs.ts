/**
 * lib/payments-ops/proofs.ts — manual payment proof → staff review → wallet
 * credit + membership activation (Phase 1/9). Reuses the wallet credit() engine
 * (idempotent per proof) and the subscription upsert pattern. No rebuild.
 */
import { prisma } from "@/lib/db";
import { credit } from "@/lib/wallet/wallet";

export async function createPaymentProof(userId: string, input: { methodKey: string; planSlug?: string; amountUsd: number; reference?: string; proofUrl?: string; note?: string; accountId?: string }) {
  return prisma.paymentProof.create({
    data: {
      userId, methodKey: input.methodKey, planSlug: input.planSlug || "",
      amountUsd: Math.max(0, Number(input.amountUsd) || 0),
      reference: String(input.reference || "").slice(0, 200), proofUrl: String(input.proofUrl || "").slice(0, 1000),
      note: String(input.note || "").slice(0, 1000), accountId: input.accountId || null, status: "pending",
    },
  });
}

export async function listPaymentProofs(opts: { status?: string; userId?: string; take?: number } = {}) {
  return prisma.paymentProof.findMany({
    where: { ...(opts.status ? { status: opts.status } : {}), ...(opts.userId ? { userId: opts.userId } : {}) },
    orderBy: { createdAt: "desc" }, take: Math.min(opts.take || 50, 200),
  });
}

async function activateMembership(userId: string, planSlug: string): Promise<string | null> {
  if (!planSlug) return null;
  const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
  if (!plan) return null;
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await prisma.subscription.upsert({
    where: { userId },
    update: { planId: plan.id, status: "active", expiresAt },
    create: { userId, planId: plan.id, status: "active", expiresAt, billingCycle: "monthly" },
  });
  return plan.slug;
}

export async function reviewPaymentProof(proofId: string, input: { decision: "approve" | "reject"; reviewerEmail?: string; reviewerStaffId?: string; note?: string }) {
  const proof = await prisma.paymentProof.findUnique({ where: { id: proofId } });
  if (!proof) return { ok: false, reason: "not_found" as const };
  if (proof.status !== "pending") return { ok: true, reason: "already_reviewed" as const, status: proof.status };

  let ledgerId: string | null = null;
  let activatedPlan: string | null = null;
  if (input.decision === "approve") {
    const res = await credit({ userId: proof.userId, kind: "topup", amountUsd: proof.amountUsd, source: "manual_review", reason: `proof:${proof.methodKey}`, idempotencyKey: `proof:${proof.id}` });
    ledgerId = res.ledgerId;
    activatedPlan = await activateMembership(proof.userId, proof.planSlug);
  }
  const review = await prisma.paymentReview.create({
    data: { proofId: proof.id, reviewerEmail: input.reviewerEmail || "admin", reviewerStaffId: input.reviewerStaffId || null, decision: input.decision, note: String(input.note || "").slice(0, 500), ledgerId, activatedPlan },
  });
  await prisma.paymentProof.update({ where: { id: proof.id }, data: { status: input.decision === "approve" ? "approved" : "rejected", reviewId: review.id, ledgerId } });
  return { ok: true as const, reviewId: review.id, ledgerId, activatedPlan, status: input.decision === "approve" ? "approved" : "rejected" };
}

export async function getProofStats() {
  const [pending, approved, rejected, byMethod] = await Promise.all([
    prisma.paymentProof.count({ where: { status: "pending" } }),
    prisma.paymentProof.count({ where: { status: "approved" } }),
    prisma.paymentProof.count({ where: { status: "rejected" } }),
    prisma.paymentProof.groupBy({ by: ["methodKey"], _count: { methodKey: true } }),
  ]);
  return { pending, approved, rejected, byMethod: byMethod.map((r) => ({ method: r.methodKey, count: r._count.methodKey })) };
}
