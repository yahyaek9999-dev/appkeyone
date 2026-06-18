/**
 * lib/incidents/engine.ts — Incident management + auto-routing + detection
 * (Phase 4/5/6). reportIncident() maps category→department, assigns the
 * least-loaded staff, and notifies (no manual assignment). scanForIncidents()
 * auto-detects failures from existing tables. Issue = internal KB taxonomy.
 */
import { prisma } from "@/lib/db";
import { leastLoadedStaff, notifyStaff } from "@/lib/staff/staff";

const CATEGORY_DEPARTMENT: Record<string, string> = {
  payments: "finance", wallet: "finance", broadcast: "operations",
  api: "developer", brain: "developer", qr: "operations", customers: "support", other: "operations",
};

export async function reportIncident(input: { category: string; source?: string; severity?: string; title: string; detail?: string; refType?: string; refId?: string; userId?: string; customerId?: string; issueKey?: string }) {
  const department = CATEGORY_DEPARTMENT[input.category] || "operations";
  const assignedStaffId = await leastLoadedStaff(department);
  const inc = await prisma.incident.create({
    data: {
      category: input.category, source: input.source || "system", severity: input.severity || "medium",
      status: assignedStaffId ? "assigned" : "open", title: input.title.slice(0, 200), detail: (input.detail || "").slice(0, 2000),
      department, assignedStaffId, issueKey: input.issueKey || null, refType: input.refType || "", refId: input.refId || null,
      userId: input.userId || null, customerId: input.customerId || null,
    },
  });
  if (assignedStaffId) {
    await prisma.staffMember.update({ where: { id: assignedStaffId }, data: { workload: { increment: 1 } } }).catch(() => {});
    await notifyStaff(assignedStaffId, { type: "incident", title: `[${input.category}] ${inc.title}`, body: input.detail || "", refType: "incident", refId: inc.id });
  }
  return inc;
}

export async function resolveIncident(id: string, input: { resolution: string; rootCause?: string; resolvedByEmail?: string }) {
  const inc = await prisma.incident.findUnique({ where: { id } });
  if (!inc) return { ok: false as const };
  await prisma.resolution.create({ data: { incidentId: id, resolution: input.resolution.slice(0, 1000), rootCause: (input.rootCause || "").slice(0, 500), resolvedByEmail: input.resolvedByEmail || "admin" } });
  await prisma.incident.update({ where: { id }, data: { status: "resolved", resolvedAt: new Date() } });
  if (inc.assignedStaffId) await prisma.staffMember.update({ where: { id: inc.assignedStaffId }, data: { workload: { decrement: 1 } } }).catch(() => {});
  return { ok: true as const };
}

/** Auto-detection: scan failure signals from existing tables and open incidents (deduped by refId). */
export async function scanForIncidents(): Promise<{ created: number; scanned: number }> {
  let created = 0, scanned = 0;

  const failedWa: any[] = await prisma.waMessage.findMany({ where: { status: "failed" }, orderBy: { queuedAt: "desc" }, take: 50, select: { id: true, userId: true, errorDetail: true } }).catch(() => []);
  scanned += failedWa.length;
  for (const m of failedWa) {
    if (!(await prisma.incident.findFirst({ where: { refType: "wa_message", refId: m.id } }))) {
      await reportIncident({ category: "broadcast", title: "WhatsApp send failed", detail: String(m.errorDetail || ""), refType: "wa_message", refId: m.id, userId: m.userId });
      created++;
    }
  }

  const failedPay: any[] = await prisma.paymentTransaction.findMany({ where: { status: "failed" }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, userId: true, failureReason: true } }).catch(() => []);
  scanned += failedPay.length;
  for (const p of failedPay) {
    if (!(await prisma.incident.findFirst({ where: { refType: "payment_tx", refId: p.id } }))) {
      await reportIncident({ category: "payments", title: "Payment failed", detail: String(p.failureReason || ""), refType: "payment_tx", refId: p.id, userId: p.userId });
      created++;
    }
  }

  const rejectedProofs: any[] = await prisma.paymentProof.findMany({ where: { status: "rejected" }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, userId: true } }).catch(() => []);
  scanned += rejectedProofs.length;
  for (const pr of rejectedProofs) {
    if (!(await prisma.incident.findFirst({ where: { refType: "payment_proof", refId: pr.id } }))) {
      await reportIncident({ category: "payments", severity: "low", title: "Payment proof rejected", refType: "payment_proof", refId: pr.id, userId: pr.userId });
      created++;
    }
  }

  return { created, scanned };
}

export async function getIncidentStats() {
  const [open, byDept, byCategory, byStatus, recent] = await Promise.all([
    prisma.incident.count({ where: { status: { in: ["open", "assigned"] } } }),
    prisma.incident.groupBy({ by: ["department"], where: { status: { in: ["open", "assigned"] } }, _count: { department: true } }),
    prisma.incident.groupBy({ by: ["category"], _count: { category: true } }),
    prisma.incident.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.incident.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: { id: true, category: true, severity: true, status: true, title: true, department: true, createdAt: true } }),
  ]);
  return {
    open,
    byDept: byDept.map((r) => ({ dept: r.department, count: r._count.department })),
    byCategory: byCategory.map((r) => ({ category: r.category, count: r._count.category })),
    byStatus: byStatus.map((r) => ({ status: r.status, count: r._count.status })),
    recent,
  };
}

// ---- Phase 5: internal KB (Issue taxonomy) ----
const ISSUES = [
  { category: "payments", key: "pay_pending_stuck", title: "Payment stuck pending", problem: "Customer paid but proof not reviewed", cause: "No finance staff assigned to method", resolution: "Assign finance staff to the method; review in /admin/payment-reviews", department: "finance" },
  { category: "wallet", key: "wallet_not_credited", title: "Wallet not credited", problem: "Approved payment but no balance", cause: "Credit idempotency replay or failed transaction", resolution: "Check WalletLedger by key proof:<id>; re-run review", department: "finance" },
  { category: "qr", key: "qr_not_connecting", title: "WhatsApp QR not connecting", problem: "Pairing fails", cause: "whatsapp-service down or session expired", resolution: "Verify wa-service health; re-pair from /dashboard/whatsapp", department: "operations" },
  { category: "brain", key: "brain_no_reply", title: "Brain returns envelope only", problem: "No AI text", cause: "No LLM provider key configured", resolution: "Set tenant AI provider key (Bot.aiProvider) or platform LLM proxy", department: "developer" },
  { category: "api", key: "api_429", title: "API rate limited", problem: "429 responses", cause: "Per-key limit exceeded", resolution: "Raise key rateLimitPerMin or back off", department: "developer" },
  { category: "customers", key: "import_failed", title: "Customer import failed", problem: "Import stuck", cause: "QR session not active for history scan", resolution: "Ensure WhatsApp connected; retry import", department: "support" },
];

export async function seedIssues(): Promise<number> {
  for (const i of ISSUES) await prisma.issue.upsert({ where: { key: i.key }, create: i, update: { title: i.title, problem: i.problem, cause: i.cause, resolution: i.resolution } }).catch(() => {});
  return ISSUES.length;
}

export async function listIssues() {
  const rows = await prisma.issue.findMany({ orderBy: { category: "asc" } });
  if (rows.length === 0) { await seedIssues(); return prisma.issue.findMany({ orderBy: { category: "asc" } }); }
  return rows;
}
