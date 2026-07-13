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
import { credit, reverse } from "@/lib/wallet/wallet";
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
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  // Reset usage counters on activation — matches app/api/admin/upgrade-
  // requests/route.ts's activation path. Without this, a customer upgrading
  // mid-cycle via this (the actual customer-facing proof-of-payment) flow
  // kept stale usage from the old plan, since rollIfNeeded() only resets at
  // the next calendar-month boundary — they could hit exhaustion sooner than
  // the new plan should allow.
  await prisma.subscription.upsert({
    where: { userId },
    update: {
      planId: plan.id,
      status: "active",
      expiresAt,
      msgsUsed: 0,
      aiRequestsUsed: 0,
      broadcastsUsed: 0,
      usageResetAt: now,
    },
    create: { userId, planId: plan.id, status: "active", expiresAt, billingCycle: "monthly", usageResetAt: now },
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
    // A payment proof is EITHER a plan purchase (planSlug set, from the billing
    // page) OR a pure wallet top-up (no planSlug). These must not both happen:
    //  - plan purchase  → the receipt pays the subscription. Activate the plan,
    //    do NOT also credit the wallet (that handed out the plan price as Meta
    //    balance on top of a paid plan — a money-loss double-credit).
    //  - wallet top-up  → credit the prepaid balance (idempotent per proof).
    if (proof.planSlug) {
      activatedPlan = await activateMembership(proof.userId, proof.planSlug);
    } else {
      const res = await credit({ userId: proof.userId, kind: "topup", amountUsd: proof.amountUsd, source: "manual_review", reason: `proof:${proof.methodKey}`, idempotencyKey: `proof:${proof.id}` });
      ledgerId = res.ledgerId;
    }
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

/**
 * Refund an approved payment. Two payment kinds, handled independently:
 *   - Wallet TOP-UP (has ledgerId): reverse the wallet credit (idempotent via
 *     reversalOf). Unchanged behaviour.
 *   - Plan PURCHASE (has planSlug, no ledger because activation never credits the
 *     wallet): DEACTIVATE the subscription so plan access is revoked — but only if
 *     the customer's CURRENT active subscription is still on the refunded plan
 *     (never cancel a newer plan they upgraded to).
 * A legacy double-credited proof (both ledgerId + planSlug) does both.
 * Reuses the existing wallet reverse() engine + subscription row — no new money
 * path. Finance/admin. Every refund is audited; the proof moves to "refunded"
 * (visible on the customer billing timeline + the finance refund view).
 */
export async function refundProof(proofId: string, input: { actorId?: string; actorEmail?: string; actorRole?: string; reason?: string }) {
  const proof = await prisma.paymentProof.findUnique({ where: { id: proofId } });
  if (!proof) return { ok: false as const, reason: "not_found" };
  if (proof.status !== "approved") return { ok: false as const, reason: "not_approved" };
  if (!proof.ledgerId && !proof.planSlug) return { ok: false as const, reason: "nothing_to_refund" };

  // (1) Wallet top-up → reverse the credit.
  let reversedLedgerId: string | null = null;
  let alreadyReversed = false;
  if (proof.ledgerId) {
    const res = await reverse({ ledgerId: proof.ledgerId, reason: `refund:proof:${proof.id} ${input.reason || ""}`.trim(), actorId: input.actorId || null, actorEmail: input.actorEmail || null });
    if (!res.ok) return { ok: false as const, reason: res.reason || "reverse_failed" };
    reversedLedgerId = proof.ledgerId;
    alreadyReversed = !!res.replay;
  }

  // (2) Plan purchase → deactivate the subscription (revoke plan access), only if
  // the current active subscription is still the plan this proof paid for.
  let deactivatedPlan: string | null = null;
  if (proof.planSlug) {
    const sub = await prisma.subscription.findUnique({ where: { userId: proof.userId }, include: { plan: true } }).catch(() => null);
    if (sub && sub.status === "active" && (sub as any).plan?.slug === proof.planSlug) {
      await prisma.subscription.update({ where: { userId: proof.userId }, data: { status: "canceled", expiresAt: new Date() } });
      deactivatedPlan = proof.planSlug;
    }
  }

  await prisma.paymentProof.update({ where: { id: proof.id }, data: { status: "refunded", rejectionReason: String(input.reason || "").slice(0, 500) } });
  await audit({
    userId: input.actorId || proof.userId,
    action: "admin.payment_refunded",
    actorId: input.actorId || null, actorEmail: input.actorEmail || null, actorRole: input.actorRole || "admin",
    targetType: "payment_proof", targetId: proof.id,
    metadata: { amountUsd: proof.amountUsd, method: proof.methodKey, plan: proof.planSlug || null, customerUserId: proof.userId, reason: input.reason || "", reversedLedgerId, deactivatedPlan, alreadyReversed },
  });
  return { ok: true as const, alreadyReversed, reversedLedgerId, deactivatedPlan };
}

/** Recently-approved proofs (for the refund view). */
export async function listApprovedProofs(take = 20) {
  return prisma.paymentProof.findMany({ where: { status: "approved" }, orderBy: { decidedAt: "desc" }, take: Math.min(take, 100) });
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
