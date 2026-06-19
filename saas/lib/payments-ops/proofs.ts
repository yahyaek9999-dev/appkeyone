/**
 * lib/payments-ops/proofs.ts — manual payment proof → staff review → wallet
 * credit + membership activation. Reuses the wallet credit() engine (idempotent
 * per proof) and the subscription upsert pattern. No rebuild.
 *
 * Lifecycle (customer-visible timeline):
 *   pending (submitted/received) → under_review → approved+activated | rejected
 *   rejected proofs can be resubmitted by the customer (back to pending).
 * Every money-moving review writes an audit row.
 */
import { prisma } from "@/lib/db";
import { credit } from "@/lib/wallet/wallet";
import { audit } from "@/lib/audit/log";

export async function createPaymentProof(userId: string, input: { methodKey: string; planSlug?: string; amountUsd: number; reference?: string; proofUrl?: string; proofImagePath?: string; note?: string; accountId?: string }) {
  return prisma.paymentProof.create({
    data: {
      userId, methodKey: input.methodKey, planSlug: input.planSlug || "",
      amountUsd: Math.max(0, Number(input.amountUsd) || 0),
      reference: String(input.reference || "").slice(0, 200), proofUrl: String(input.proofUrl || "").slice(0, 1000),
      proofImagePath: String(input.proofImagePath || "").slice(0, 300),
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

/** Reviewer opens a proof — moves pending → under_review (visible to the customer). */
export async function startReview(proofId: string, reviewerName?: string) {
  const proof = await prisma.paymentProof.findUnique({ where: { id: proofId } });
  if (!proof) return { ok: false as const, reason: "not_found" };
  if (proof.status !== "pending") return { ok: true as const, status: proof.status };
  const updated = await prisma.paymentProof.update({
    where: { id: proofId },
    data: { status: "under_review", reviewStartedAt: new Date(), reviewerName: (reviewerName || "").slice(0, 160) },
  });
  return { ok: true as const, status: updated.status };
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

export async function reviewPaymentProof(proofId: string, input: { decision: "approve" | "reject"; reviewerEmail?: string; reviewerStaffId?: string; reviewerName?: string; note?: string; rejectionReason?: string; actorId?: string; actorRole?: string }) {
  const proof = await prisma.paymentProof.findUnique({ where: { id: proofId } });
  if (!proof) return { ok: false, reason: "not_found" as const };
  if (proof.status !== "pending" && proof.status !== "under_review") return { ok: true, reason: "already_reviewed" as const, status: proof.status };

  let ledgerId: string | null = null;
  let activatedPlan: string | null = null;
  const now = new Date();
  if (input.decision === "approve") {
    const res = await credit({ userId: proof.userId, kind: "topup", amountUsd: proof.amountUsd, source: "manual_review", reason: `proof:${proof.methodKey}`, idempotencyKey: `proof:${proof.id}` });
    ledgerId = res.ledgerId;
    activatedPlan = await activateMembership(proof.userId, proof.planSlug);
  }
  const reviewerName = (input.reviewerName || input.reviewerEmail || "الفريق").slice(0, 160);
  const review = await prisma.paymentReview.create({
    data: { proofId: proof.id, reviewerEmail: input.reviewerEmail || "admin", reviewerStaffId: input.reviewerStaffId || null, decision: input.decision, note: String(input.note || "").slice(0, 500), ledgerId, activatedPlan },
  });
  await prisma.paymentProof.update({
    where: { id: proof.id },
    data: {
      status: input.decision === "approve" ? "approved" : "rejected",
      reviewId: review.id, ledgerId, reviewerName, decidedAt: now,
      ...(input.decision === "approve" ? { activatedAt: activatedPlan ? now : null } : {}),
      ...(input.decision === "reject" ? { rejectionReason: String(input.rejectionReason || input.note || "").slice(0, 500) } : {}),
    },
  });

  // Money-movement accountability: who approved/rejected what, for how much.
  await audit({
    userId: input.actorId || proof.userId,
    action: input.decision === "approve" ? "admin.payment_approved" : "admin.payment_rejected",
    actorId: input.actorId || null, actorEmail: input.reviewerEmail || null, actorRole: input.actorRole || "admin",
    targetType: "payment_proof", targetId: proof.id,
    metadata: { decision: input.decision, amountUsd: proof.amountUsd, method: proof.methodKey, plan: proof.planSlug || null, customerUserId: proof.userId, activatedPlan, ledgerId },
  });

  return { ok: true as const, reviewId: review.id, ledgerId, activatedPlan, status: input.decision === "approve" ? "approved" : "rejected" };
}

/** Customer cancels their own still-pending/under-review payment proof. */
export async function cancelProof(userId: string, proofId: string) {
  const proof = await prisma.paymentProof.findFirst({ where: { id: proofId, userId } });
  if (!proof) return { ok: false as const, reason: "not_found" };
  if (proof.status !== "pending" && proof.status !== "under_review") return { ok: false as const, reason: "not_pending" };
  await prisma.paymentProof.update({ where: { id: proofId }, data: { status: "canceled" } });
  return { ok: true as const };
}

/** Rejection recovery: customer resubmits a rejected proof with a new receipt — back to pending, never stuck. */
export async function resubmitProof(userId: string, proofId: string, input: { proofImagePath?: string; proofUrl?: string; reference?: string }) {
  const proof = await prisma.paymentProof.findFirst({ where: { id: proofId, userId } });
  if (!proof) return { ok: false as const, reason: "not_found" };
  if (proof.status !== "rejected" && proof.status !== "canceled") return { ok: false as const, reason: "not_resubmittable" };
  const updated = await prisma.paymentProof.update({
    where: { id: proofId },
    data: {
      status: "pending",
      proofImagePath: input.proofImagePath ? String(input.proofImagePath).slice(0, 300) : proof.proofImagePath,
      proofUrl: input.proofUrl !== undefined ? String(input.proofUrl).slice(0, 1000) : proof.proofUrl,
      reference: input.reference !== undefined ? String(input.reference).slice(0, 200) : proof.reference,
      rejectionReason: "", reviewerName: "", reviewStartedAt: null, decidedAt: null, reviewId: null,
    },
  });
  return { ok: true as const, status: updated.status };
}

export async function getProofStats() {
  const [pending, underReview, approved, rejected, byMethod] = await Promise.all([
    prisma.paymentProof.count({ where: { status: "pending" } }),
    prisma.paymentProof.count({ where: { status: "under_review" } }),
    prisma.paymentProof.count({ where: { status: "approved" } }),
    prisma.paymentProof.count({ where: { status: "rejected" } }),
    prisma.paymentProof.groupBy({ by: ["methodKey"], _count: { methodKey: true } }),
  ]);
  return { pending, underReview, approved, rejected, byMethod: byMethod.map((r) => ({ method: r.methodKey, count: r._count.methodKey })) };
}
