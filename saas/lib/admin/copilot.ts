// Admin AI Copilot — read-only, evidence-grounded, RBAC-scoped.
//
// The Copilot NEVER invents numbers and NEVER performs actions. It:
//   1. Gathers a bounded, real snapshot from canonical Admin services.
//   2. Passes ONLY that snapshot to the LLM with a strict system prompt:
//      answer from the snapshot, cite sources, say "insufficient data" otherwise.
//   3. Returns the answer + the raw snapshot so the UI can show the evidence.
//
// If the LLM is unreachable, a deterministic fallback summary is returned from
// the same snapshot (still real numbers) — the Copilot degrades, never fabricates.

import { chat } from "@/lib/llm";
import { getRevenueSummary } from "@/lib/admin/finance";
import { detectReconciliationIssues } from "@/lib/admin/finance-reconcile";
import { getGatewayHealth } from "@/lib/admin/finance";
import { getTenantRiskList } from "@/lib/admin/tenant-risk";
import { getCustomerSuccessQueue } from "@/lib/admin/customer-success";
import { getSlaMetrics } from "@/lib/admin/sla";
import { getSecurityAttention } from "@/lib/admin/security";
import { prisma } from "@/lib/db";

export type CopilotSnapshot = {
  revenue: { grossPaidUsd: number; netCollectedUsd: number; refundsUsd: number; paidCount: number; failedCount: number; pendingCount: number; days: number };
  revenuePrev: { grossPaidUsd: number; paidCount: number } | null;
  reconciliation: { total: number; critical: number; autoFixable: number };
  gateways: { name: string; health: string; successRatePct: number | null; recentFailed: number }[];
  risk: { criticalCount: number; highCount: number; top: { email: string | null; score: number; reasons: string[] }[] };
  customerSuccess: { counts: Record<string, number>; total: number };
  sla: { label: string; current: number | null; target: number; unit: string; status: string }[];
  incidents: { openHighCritical: number; openTotal: number };
  security: { criticalProtection24h: number };
};

async function gatherSnapshot(): Promise<CopilotSnapshot> {
  const now = Date.now();
  const prevSince = new Date(now - 60 * 86_400_000);
  const prevUntil = new Date(now - 30 * 86_400_000);

  const [rev, recon, gws, risk, cs, sla, sec, openHC, openTotal, prevPaid] = await Promise.all([
    getRevenueSummary(30).catch(() => null),
    detectReconciliationIssues(90).catch(() => null),
    getGatewayHealth(30).catch(() => []),
    getTenantRiskList({ minScore: 45, take: 300 }).catch(() => ({ rows: [] as any[] })),
    getCustomerSuccessQueue({ take: 300 }).catch(() => ({ counts: {} as Record<string, number>, items: [] as any[] })),
    getSlaMetrics(7).catch(() => ({ metrics: [] as any[] })),
    getSecurityAttention().catch(() => ({ criticalProtection24h: 0 })),
    prisma.incident.count({ where: { status: { in: ["open", "assigned"] }, severity: { in: ["high", "critical"] } } }).catch(() => 0),
    prisma.incident.count({ where: { status: { in: ["open", "assigned"] } } }).catch(() => 0),
    prisma.paymentTransaction
      .aggregate({ where: { status: { in: ["paid", "reconciled"] }, createdAt: { gte: prevSince, lt: prevUntil } }, _sum: { amountUsd: true }, _count: true })
      .catch(() => null),
  ]);

  const riskRows = (risk.rows as any[]) || [];
  return {
    revenue: rev
      ? { grossPaidUsd: rev.grossPaidUsd, netCollectedUsd: rev.netCollectedUsd, refundsUsd: rev.refundsUsd, paidCount: rev.paidCount, failedCount: rev.failedCount, pendingCount: rev.pendingCount, days: rev.days }
      : { grossPaidUsd: 0, netCollectedUsd: 0, refundsUsd: 0, paidCount: 0, failedCount: 0, pendingCount: 0, days: 30 },
    revenuePrev: prevPaid ? { grossPaidUsd: Math.round((prevPaid._sum?.amountUsd ?? 0) * 100) / 100, paidCount: prevPaid._count ?? 0 } : null,
    reconciliation: recon ? { total: recon.counts.total, critical: recon.counts.critical, autoFixable: recon.autoFixableCount } : { total: 0, critical: 0, autoFixable: 0 },
    gateways: (gws as any[]).map((g) => ({ name: g.displayName, health: g.health, successRatePct: g.successRatePct, recentFailed: g.recentFailed })),
    risk: {
      criticalCount: riskRows.filter((r) => r.level === "critical").length,
      highCount: riskRows.filter((r) => r.level === "high").length,
      top: riskRows.slice(0, 5).map((r) => ({ email: r.email, score: r.score, reasons: r.reasons.map((x: any) => x.label) })),
    },
    customerSuccess: { counts: (cs as any).counts || {}, total: ((cs as any).items || []).length },
    sla: (sla.metrics as any[]).map((m) => ({ label: m.label, current: m.current, target: m.target, unit: m.unit, status: m.status })),
    incidents: { openHighCritical: openHC, openTotal },
    security: { criticalProtection24h: (sec as any).criticalProtection24h ?? 0 },
  };
}

const SYSTEM_PROMPT = `أنت مساعد تحليلي للوحة إدارة منصّة SaaS (KEYONE). سيُعطى لك "لقطة بيانات" JSON حقيقية من النظام.
قواعد صارمة:
1) أجب فقط من اللقطة المعطاة. لا تخترع أي رقم أو اسم أو حالة.
2) إن لم تكن البيانات كافية للإجابة، قل صراحةً: "البيانات غير كافية" واذكر ما الذي ينقص.
3) اذكر المصادر التي استندت إليها (مثل: الإيرادات، المدفوعات، المخاطر، SLA).
4) كن موجزاً وعملياً. استخدم أرقام اللقطة كما هي.
5) لا تقترح تنفيذ أي إجراء حسّاس تلقائياً؛ يمكنك التوصية بمراجعة صفحة معيّنة فقط.
أجب بالعربية.`;

export type CopilotAnswer = {
  answer: string;
  usedLlm: boolean;
  snapshot: CopilotSnapshot;
  sources: string[];
};

function deterministicFallback(q: string, s: CopilotSnapshot): string {
  const lines: string[] = [];
  const revDelta = s.revenuePrev ? s.revenue.grossPaidUsd - s.revenuePrev.grossPaidUsd : null;
  lines.push(`الإيراد المُحصّل (آخر ${s.revenue.days} يوم): $${s.revenue.grossPaidUsd.toLocaleString()} من ${s.revenue.paidCount} دفعة ناجحة.`);
  if (revDelta != null && s.revenuePrev) {
    const pct = s.revenuePrev.grossPaidUsd > 0 ? Math.round((revDelta / s.revenuePrev.grossPaidUsd) * 100) : null;
    lines.push(`مقارنة بالـ٣٠ يوم السابقة ($${s.revenuePrev.grossPaidUsd.toLocaleString()})${pct != null ? ` تغيّر ${pct}%` : ""}.`);
  }
  if (s.revenue.failedCount > 0) lines.push(`${s.revenue.failedCount} دفعة فاشلة و${s.revenue.pendingCount} قيد الانتظار.`);
  if (s.reconciliation.critical > 0) lines.push(`تسوية: ${s.reconciliation.critical} تعارض حرج (${s.reconciliation.autoFixable} قابل للتسوية الآمنة).`);
  const badGw = s.gateways.filter((g) => g.health === "failing" || g.health === "degraded");
  if (badGw.length) lines.push(`بوابات تحتاج انتباهاً: ${badGw.map((g) => `${g.name} (${g.health})`).join("، ")}.`);
  if (s.risk.criticalCount + s.risk.highCount > 0) lines.push(`مخاطر التجّار: ${s.risk.criticalCount} حرج و${s.risk.highCount} مرتفع.`);
  if (s.incidents.openHighCritical > 0) lines.push(`حوادث غير محلولة (حرجة/مرتفعة): ${s.incidents.openHighCritical}.`);
  const breached = s.sla.filter((m) => m.status === "breached");
  if (breached.length) lines.push(`تجاوزات SLA: ${breached.map((m) => m.label).join("، ")}.`);
  lines.push("");
  lines.push("(مُلخّص محسوب مباشرة من بيانات النظام — مساعد الذكاء غير متاح حالياً.)");
  return lines.join("\n");
}

const SOURCES = ["الإيرادات", "المدفوعات", "التسوية", "بوابات الدفع", "مخاطر التجّار", "نجاح العملاء", "SLA", "الحوادث", "الأمان"];

export async function askCopilot(question: string): Promise<CopilotAnswer> {
  const snapshot = await gatherSnapshot();

  const userMsg = `سؤال المشرف: ${question}\n\nلقطة البيانات (JSON):\n${JSON.stringify(snapshot)}`;

  let answer = "";
  let usedLlm = false;
  try {
    answer = await chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
      { temperature: 0.1, maxTokens: 700, timeoutMs: 30000, retries: 1 },
    );
    usedLlm = !!answer && answer.trim().length > 0;
  } catch {
    usedLlm = false;
  }

  if (!usedLlm) answer = deterministicFallback(question, snapshot);

  return { answer, usedLlm, snapshot, sources: SOURCES };
}
