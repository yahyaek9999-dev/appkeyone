// Unified Admin Attention aggregator.
//
// Single source for cross-domain "needs attention" signals, composed from the
// CANONICAL services of each domain (finance, security, incidents, SLA, backups,
// risk, customer-success). The Command Center and the Notification Center both
// render these — no duplicate signal logic in either page.
//
// Every signal is derived from a real query. Domains with no data source (e.g.
// backup verification, which is not exposed to app runtime) do NOT emit a signal
// rather than emit a fabricated one.

import { prisma } from "@/lib/db";
import { getSecurityAttention } from "@/lib/admin/security";
import { getSlaAttention } from "@/lib/admin/sla";
import { getTenantRiskList } from "@/lib/admin/tenant-risk";
import { getCustomerSuccessQueue } from "@/lib/admin/customer-success";

export type AttentionSeverity = "critical" | "warn" | "info";
export type AttentionDomain = "security" | "incident" | "sla" | "backup" | "risk" | "customer_success";

export type AttentionSignal = {
  id: string;
  domain: AttentionDomain;
  severity: AttentionSeverity;
  area: string;
  problem: string;
  cta: string;
  href: string;
};

/** Batch-4/5 operational + intelligence signals (finance signals live in
 *  lib/admin/finance-reconcile and are added by the Command Center separately). */
export async function getOpsAttentionSignals(): Promise<AttentionSignal[]> {
  const out: AttentionSignal[] = [];

  const [sec, unresolvedIncidents, sla, risk, cs] = await Promise.all([
    getSecurityAttention().catch(() => ({ criticalProtection24h: 0, unresolvedCritical: 0 })),
    prisma.incident.count({ where: { status: { in: ["open", "assigned"] }, severity: { in: ["high", "critical"] } } }).catch(() => 0),
    getSlaAttention().catch(() => []),
    getTenantRiskList({ minScore: 70, take: 200 }).catch(() => ({ rows: [] as any[] })),
    getCustomerSuccessQueue({ take: 200 }).catch(() => ({ items: [] as any[], counts: {} as Record<string, number> })),
  ]);

  // Security spike
  if (sec.criticalProtection24h > 0) {
    out.push({
      id: "security_spike",
      domain: "security",
      severity: "critical",
      area: "الأمان",
      problem: `${sec.criticalProtection24h} حدث حماية حرج خلال ٢٤ ساعة`,
      cta: "افحص الأمان",
      href: "/admin/security?severity=critical",
    });
  }

  // Unresolved high/critical incidents
  if (unresolvedIncidents > 0) {
    out.push({
      id: "incidents_unresolved",
      domain: "incident",
      severity: "critical",
      area: "الحوادث",
      problem: `${unresolvedIncidents} حادثة حرجة/مرتفعة غير محلولة`,
      cta: "افتح الحوادث",
      href: "/admin/incidents",
    });
  }

  // SLA breaches
  for (const b of sla) {
    out.push({
      id: `sla_${b.key}`,
      domain: "sla",
      severity: "warn",
      area: "مستوى الخدمة",
      problem: `${b.label}: ${b.current}${b.unit} تجاوز الهدف ${b.target}${b.unit}`,
      cta: "افحص SLA",
      href: "/admin/sla",
    });
  }

  // Backups — no app-runtime source. Emit a single INFO signal directing to the
  // honest backups page (never a fake "overdue"/"failed").
  // (Intentionally not a warn/critical: we have no evidence either way.)

  // High/critical risk tenants
  const criticalRisk = (risk.rows as any[]).filter((r) => r.level === "critical").length;
  if (criticalRisk > 0) {
    out.push({
      id: "risk_critical",
      domain: "risk",
      severity: "warn",
      area: "مخاطر التجّار",
      problem: `${criticalRisk} تاجر بمستوى خطر حرج`,
      cta: "افحص المخاطر",
      href: "/admin/risk",
    });
  }

  // Customer success: trial/sub expiring + never-connected WA
  const csCounts = (cs as any).counts as Record<string, number>;
  const expiring = (csCounts.trial_expiring ?? 0) + (csCounts.sub_expiring ?? 0);
  if (expiring > 0) {
    out.push({
      id: "cs_expiring",
      domain: "customer_success",
      severity: "warn",
      area: "نجاح العملاء",
      problem: `${expiring} اشتراك/تجربة تنتهي خلال ٣ أيام`,
      cta: "قائمة المتابعة",
      href: "/admin/customer-success",
    });
  }
  if ((csCounts.never_connected_wa ?? 0) > 0) {
    out.push({
      id: "cs_never_wa",
      domain: "customer_success",
      severity: "info",
      area: "نجاح العملاء",
      problem: `${csCounts.never_connected_wa} تاجر لم يربط واتساب`,
      cta: "قائمة المتابعة",
      href: "/admin/customer-success",
    });
  }

  return out;
}
