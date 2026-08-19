// Payment reconciliation DETECTION — read-only.
//
// This module only DETECTS mismatches that are provable from the existing data
// model. It performs no financial mutation. Remediation is delegated to the
// existing, idempotent lib/payments `reconcilePayments()` sweep; anything that
// sweep cannot safely fix is reported as `manualIntervention: true` rather than
// offering a button that silently rewrites money.
//
// Every rule below is derived from real relationships:
//   PaymentTransaction.ledgerId  ←→ WalletLedger.id
//   PaymentTransaction.status    ∈ created|pending|paid|failed|expired|refunded|reconciled
//   PaymentProof.status/ledgerId (manual review flow)
//   WalletLedger.kind = topup|refund|reversal|adjustment
//   Subscription.status

import { prisma } from "@/lib/db";
import { roundUsd } from "@/lib/wallet/money";

export type IssueSeverity = "critical" | "high" | "medium" | "low";

export type ReconIssue = {
  rule: string;
  severity: IssueSeverity;
  title: string;
  detail: string;
  /** True when the existing idempotent sweep can fix it. */
  autoFixable: boolean;
  /** True when only an operator can resolve it — no auto-fix is offered. */
  manualIntervention: boolean;
  recommendedAction: string;
  tenantId: string | null;
  tenantEmail: string | null;
  amountUsd: number | null;
  paymentId: string | null;
  relatedIds: Record<string, string | null>;
  at: Date | null;
};

export type ReconReport = {
  generatedAt: string;
  scannedWindowDays: number;
  counts: { critical: number; high: number; medium: number; low: number; total: number };
  autoFixableCount: number;
  issues: ReconIssue[];
};

const SCAN_LIMIT = 200; // bounded — never a full-table scan
const DUP_WINDOW_MIN = 10;

export async function detectReconciliationIssues(days = 90): Promise<ReconReport> {
  const since = new Date(Date.now() - days * 86_400_000);
  const issues: ReconIssue[] = [];

  // ── Rule 1: payment succeeded but wallet was never credited ────────────────
  // Provable: status ∈ {paid} AND ledgerId IS NULL. The existing sweep fixes it
  // idempotently (key `payment:<provider>:<ref>`).
  const paidNoLedger = await prisma.paymentTransaction
    .findMany({
      where: { status: "paid", ledgerId: null, createdAt: { gte: since } },
      select: { id: true, userId: true, provider: true, amountUsd: true, providerRef: true, createdAt: true },
      take: SCAN_LIMIT,
      orderBy: { createdAt: "desc" },
    })
    .catch(() => []);

  for (const tx of paidNoLedger) {
    issues.push({
      rule: "paid_not_credited",
      severity: "critical",
      title: "دفعة ناجحة بدون إضافة للمحفظة",
      detail: `المعاملة ${tx.id} حالتها "مدفوعة" لكن لا يوجد قيد محفظة مرتبط بها.`,
      autoFixable: true,
      manualIntervention: false,
      recommendedAction: "شغّل تسوية المدفوعات — العملية idempotent وتعيد الإضافة بأمان.",
      tenantId: tx.userId,
      tenantEmail: null,
      amountUsd: roundUsd(tx.amountUsd),
      paymentId: tx.id,
      relatedIds: { providerRef: tx.providerRef ?? null, ledgerId: null },
      at: tx.createdAt,
    });
  }

  // ── Rule 2: refunded payment with no refund/reversal ledger entry ──────────
  const refunded = await prisma.paymentTransaction
    .findMany({
      where: { status: "refunded", createdAt: { gte: since } },
      select: { id: true, userId: true, amountUsd: true, ledgerId: true, createdAt: true },
      take: SCAN_LIMIT,
      orderBy: { createdAt: "desc" },
    })
    .catch(() => []);

  for (const tx of refunded) {
    const hasReversal = tx.ledgerId
      ? await (prisma as any).walletLedger
          ?.count({ where: { kind: { in: ["refund", "reversal"] }, reversalOf: tx.ledgerId } })
          .catch(() => 0)
      : 0;
    if (!hasReversal) {
      issues.push({
        rule: "refund_without_reversal",
        severity: "high",
        title: "استرداد بدون قيد عكسي في المحفظة",
        detail: `المعاملة ${tx.id} مُعلّمة "مُستردة" لكن لا يوجد قيد refund/reversal مقابل لها.`,
        autoFixable: false,
        manualIntervention: true,
        recommendedAction: "تدخّل يدوي مطلوب — راجع الاسترداد لدى البوابة ثم سجّل القيد العكسي عبر أدوات المحفظة.",
        tenantId: tx.userId,
        tenantEmail: null,
        amountUsd: roundUsd(tx.amountUsd),
        paymentId: tx.id,
        relatedIds: { ledgerId: tx.ledgerId ?? null },
        at: tx.createdAt,
      });
    }
  }

  // ── Rule 3: approved manual payment proof never credited ───────────────────
  const approvedProofs = await (prisma as any).paymentProof
    ?.findMany({
      where: { status: "approved", ledgerId: null, createdAt: { gte: since } },
      select: { id: true, userId: true, amountUsd: true, methodKey: true, createdAt: true, reviewId: true },
      take: SCAN_LIMIT,
      orderBy: { createdAt: "desc" },
    })
    .catch(() => []) ?? [];

  for (const p of approvedProofs as any[]) {
    issues.push({
      rule: "approved_proof_not_credited",
      severity: "high",
      title: "إثبات دفع معتمد بدون إضافة رصيد",
      detail: `الإثبات ${p.id} تم اعتماده لكن لا يوجد قيد محفظة مرتبط (${p.methodKey}).`,
      autoFixable: false,
      manualIntervention: true,
      recommendedAction: "تدخّل يدوي مطلوب — أعد فتح المراجعة أو نفّذ الإضافة عبر أدوات المحفظة الحالية.",
      tenantId: p.userId,
      tenantEmail: null,
      amountUsd: roundUsd(p.amountUsd),
      paymentId: null,
      relatedIds: { proofId: p.id, reviewId: p.reviewId ?? null },
      at: p.createdAt,
    });
  }

  // ── Rule 4: possible duplicate payment ────────────────────────────────────
  // The schema's @@unique([provider, providerRef]) already blocks exact dupes,
  // so we look for the operationally-real case: same tenant + provider + amount
  // paid twice within a short window.
  const recentPaid = await prisma.paymentTransaction
    .findMany({
      where: { status: { in: ["paid", "reconciled"] }, createdAt: { gte: since } },
      select: { id: true, userId: true, provider: true, amountUsd: true, createdAt: true },
      take: 1000,
      orderBy: { createdAt: "desc" },
    })
    .catch(() => []);

  const seen = new Map<string, { id: string; at: Date }>();
  for (const tx of recentPaid) {
    const key = `${tx.userId}|${tx.provider}|${tx.amountUsd}`;
    const prev = seen.get(key);
    if (prev && Math.abs(prev.at.getTime() - tx.createdAt.getTime()) <= DUP_WINDOW_MIN * 60_000) {
      issues.push({
        rule: "possible_duplicate",
        severity: "medium",
        title: "دفعة مكرّرة محتملة",
        detail: `معاملتان بنفس التاجر والبوابة والمبلغ خلال ${DUP_WINDOW_MIN} دقيقة (${prev.id} و ${tx.id}).`,
        autoFixable: false,
        manualIntervention: true,
        recommendedAction: "تدخّل يدوي مطلوب — تحقّق لدى البوابة قبل أي استرداد.",
        tenantId: tx.userId,
        tenantEmail: null,
        amountUsd: roundUsd(tx.amountUsd),
        paymentId: tx.id,
        relatedIds: { duplicateOf: prev.id },
        at: tx.createdAt,
      });
    }
    seen.set(key, { id: tx.id, at: tx.createdAt });
  }

  // ── Rule 5: stale intents that the sweep should have expired ──────────────
  const staleCutoff = new Date(Date.now() - 24 * 60 * 60_000);
  const stale = await prisma.paymentTransaction
    .count({ where: { status: { in: ["created", "pending"] }, provider: { not: "manual" }, createdAt: { lt: staleCutoff } } })
    .catch(() => 0);

  if (stale > 0) {
    issues.push({
      rule: "stale_intents",
      severity: "low",
      title: `${stale} نية دفع متروكة لم تُغلق`,
      detail: "معاملات بحالة created/pending أقدم من 24 ساعة لدى بوابة غير يدوية.",
      autoFixable: true,
      manualIntervention: false,
      recommendedAction: "شغّل تسوية المدفوعات — تُنهي النوايا المتروكة بأمان.",
      tenantId: null,
      tenantEmail: null,
      amountUsd: null,
      paymentId: null,
      relatedIds: {},
      at: null,
    });
  }

  // ── Rule 6: wallet topup credited with no matching payment record ─────────
  // Provable: a topup ledger entry whose idempotencyKey encodes a payment ref
  // (`payment:<provider>:<ref>`) for which no PaymentTransaction row exists.
  const topupLedgers = await (prisma as any).walletLedger
    ?.findMany({
      where: { kind: "topup", createdAt: { gte: since }, idempotencyKey: { startsWith: "payment:" } },
      select: { id: true, userId: true, amountUsd: true, idempotencyKey: true, createdAt: true },
      take: SCAN_LIMIT,
      orderBy: { createdAt: "desc" },
    })
    .catch(() => []) ?? [];

  for (const l of topupLedgers as any[]) {
    const linked = await prisma.paymentTransaction.count({ where: { ledgerId: l.id } }).catch(() => 0);
    if (linked === 0) {
      issues.push({
        rule: "credit_without_payment",
        severity: "high",
        title: "رصيد مُضاف بدون معاملة دفع مرتبطة",
        detail: `قيد المحفظة ${l.id} من نوع topup لا ترتبط به أي معاملة دفع (${l.idempotencyKey}).`,
        autoFixable: false,
        manualIntervention: true,
        recommendedAction: "تدخّل يدوي مطلوب — تحقّق من سجل البوابة قبل أي تعديل على الرصيد.",
        tenantId: l.userId,
        tenantEmail: null,
        amountUsd: roundUsd(l.amountUsd),
        paymentId: null,
        relatedIds: { ledgerId: l.id },
        at: l.createdAt,
      });
    }
  }

  // Resolve tenant emails in one bounded lookup.
  const ids = Array.from(new Set(issues.map((i) => i.tenantId).filter(Boolean))) as string[];
  if (ids.length) {
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } }).catch(() => []);
    const map = new Map(users.map((u) => [u.id, u.email]));
    for (const i of issues) if (i.tenantId) i.tenantEmail = map.get(i.tenantId) ?? null;
  }

  const order: Record<IssueSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  const counts = { critical: 0, high: 0, medium: 0, low: 0, total: issues.length };
  for (const i of issues) counts[i.severity]++;

  return {
    generatedAt: new Date().toISOString(),
    scannedWindowDays: days,
    counts,
    autoFixableCount: issues.filter((i) => i.autoFixable).length,
    issues,
  };
}

/** Compact finance signals for the Batch 1 Command Center attention list. */
export async function getFinanceAttentionSignals(): Promise<
  { severity: "critical" | "warn"; area: string; problem: string; cta: string; href: string }[]
> {
  const out: { severity: "critical" | "warn"; area: string; problem: string; cta: string; href: string }[] = [];

  // NOTE: pending payment proofs are already surfaced by the Command Center's
  // own action list — not duplicated here.
  const [paidNoLedger, refundNoReversal] = await Promise.all([
    prisma.paymentTransaction.count({ where: { status: "paid", ledgerId: null } }).catch(() => 0),
    prisma.paymentTransaction.count({ where: { status: "refunded" } }).catch(() => 0),
  ]);

  if (paidNoLedger > 0) {
    out.push({
      severity: "critical",
      area: "المالية",
      problem: `${paidNoLedger} دفعة ناجحة بدون إضافة رصيد للمحفظة`,
      cta: "افتح التسوية",
      href: "/admin/payments/reconciliation",
    });
  }

  // Gateways with a real, evidenced failure signal.
  const gateways = await (prisma as any).paymentGateway
    ?.findMany({ where: { status: "active" }, select: { adapter: true, displayName: true, name: true } })
    .catch(() => []) ?? [];
  const since = new Date(Date.now() - 7 * 86_400_000);
  for (const g of gateways as any[]) {
    const [paid, failed] = await Promise.all([
      prisma.paymentTransaction.count({ where: { provider: g.adapter, status: { in: ["paid", "reconciled"] }, createdAt: { gte: since } } }).catch(() => 0),
      prisma.paymentTransaction.count({ where: { provider: g.adapter, status: "failed", createdAt: { gte: since } } }).catch(() => 0),
    ]);
    const decided = paid + failed;
    if (decided >= 5 && failed / decided > 0.4) {
      out.push({
        severity: "warn",
        area: "بوابات الدفع",
        problem: `${g.displayName || g.name}: نسبة فشل ${Math.round((failed / decided) * 100)}% خلال ٧ أيام`,
        cta: "حالة البوابات",
        href: "/admin/payment-gateways",
      });
    }
  }

  if (refundNoReversal > 0) {
    // Only surface when at least one genuinely lacks a reversal.
    const suspect = await prisma.paymentTransaction
      .findMany({ where: { status: "refunded" }, select: { ledgerId: true }, take: 50 })
      .catch(() => []);
    let missing = 0;
    for (const s of suspect) {
      if (!s.ledgerId) { missing++; continue; }
      const c = await (prisma as any).walletLedger
        ?.count({ where: { kind: { in: ["refund", "reversal"] }, reversalOf: s.ledgerId } })
        .catch(() => 0);
      if (!c) missing++;
    }
    if (missing > 0) {
      out.push({
        severity: "warn",
        area: "المالية",
        problem: `${missing} استرداد بدون قيد عكسي في المحفظة`,
        cta: "افتح التسوية",
        href: "/admin/payments/reconciliation",
      });
    }
  }

  return out;
}
