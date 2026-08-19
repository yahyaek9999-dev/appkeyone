// Security Center aggregation — real signals only.
//
// Sources (all existing):
//   ProtectionLog  → flood/spam/abuse/ban with severity (written by lib/protection)
//   AuditLog       → sensitive admin actions (actor/action/target/ip)
//   ApiRequestLog  → API error responses (status >= 400) as an abuse signal
//
// Signals NOT persisted anywhere in the app (e.g. failed logins) are reported as
// `available: false` rather than fabricated. Never exposes secrets/tokens.

import { prisma } from "@/lib/db";

export type SecuritySeverity = "critical" | "warn" | "info";

export type SecurityEvent = {
  id: string;
  source: "protection" | "admin_audit" | "api_error";
  type: string;
  severity: SecuritySeverity;
  summary: string;
  tenantId: string | null;
  tenantEmail: string | null;
  actorEmail: string | null;
  ip: string | null;
  refId: string | null;
  at: Date;
};

export type SecurityFilters = {
  severity?: SecuritySeverity;
  source?: SecurityEvent["source"];
  q?: string;       // tenant email
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export type SecurityAvailability = {
  protectionLogs: boolean;
  adminAudit: boolean;
  apiErrors: boolean;
  failedLogins: boolean; // NOT persisted in this app → always false (honest)
};

export type SecurityResult = {
  generatedAt: string;
  availability: SecurityAvailability;
  counts: { critical: number; warn: number; info: number; total: number };
  events: SecurityEvent[];
  page: number;
  pageSize: number;
  pages: number;
};

const ADMIN_AUDIT_PREFIX = ["admin.", "release.", "safety.", "whatsapp."];

function protSeverity(s: string): SecuritySeverity {
  if (s === "critical") return "critical";
  if (s === "warn") return "warn";
  return "info";
}

export async function getSecurityEvents(f: SecurityFilters = {}): Promise<SecurityResult> {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, f.pageSize ?? 50));
  const now = Date.now();
  const since = f.from ? new Date(f.from) : new Date(now - 14 * 86_400_000);
  const until = f.to ? (() => { const d = new Date(f.to!); d.setHours(23, 59, 59, 999); return d; })() : new Date(now);

  // Resolve tenant filter to owner ids (bounded).
  let tenantIds: string[] | null = null;
  if (f.q?.trim()) {
    const owners = await prisma.user
      .findMany({ where: { email: { contains: f.q.trim(), mode: "insensitive" } }, select: { id: true }, take: 50 })
      .catch(() => [] as { id: string }[]);
    tenantIds = owners.map((o) => o.id);
    if (!tenantIds.length) tenantIds = ["__none__"];
  }

  const wantSource = (s: SecurityEvent["source"]) => !f.source || f.source === s;

  // ── ProtectionLog ──────────────────────────────────────────────────────────
  const protWhere: any = { createdAt: { gte: since, lte: until } };
  if (tenantIds) protWhere.userId = { in: tenantIds };
  if (f.severity) protWhere.severity = f.severity === "warn" ? "warn" : f.severity;

  const prot = wantSource("protection")
    ? await (prisma as any).protectionLog
        ?.findMany({ where: protWhere, orderBy: { createdAt: "desc" }, take: 400 })
        .catch(() => []) ?? []
    : [];

  // ── AuditLog (sensitive admin actions) ─────────────────────────────────────
  const auditWhere: any = { createdAt: { gte: since, lte: until }, OR: ADMIN_AUDIT_PREFIX.map((p) => ({ action: { startsWith: p } })) };
  if (tenantIds) auditWhere.userId = { in: tenantIds };
  const audits = wantSource("admin_audit") && (!f.severity || f.severity === "info")
    ? await (prisma as any).auditLog
        ?.findMany({ where: { ...auditWhere, at: { gte: since, lte: until } }, orderBy: { at: "desc" }, take: 300 })
        .catch(() => []) ?? []
    : [];

  // ── ApiRequestLog (error responses = abuse/instability signal) ─────────────
  const apiWhere: any = { createdAt: { gte: since, lte: until }, status: { gte: 400 } };
  if (tenantIds) apiWhere.userId = { in: tenantIds };
  const apiErrors = wantSource("api_error")
    ? await (prisma as any).apiRequestLog
        ?.findMany({ where: apiWhere, orderBy: { createdAt: "desc" }, take: 300 })
        .catch(() => []) ?? []
    : [];

  // Normalise into one stream.
  const events: SecurityEvent[] = [];

  for (const p of prot as any[]) {
    events.push({
      id: `prot:${p.id}`,
      source: "protection",
      type: p.kind,
      severity: protSeverity(p.severity),
      summary: `${p.action} — ${p.reason || p.kind}${p.score ? ` (score ${p.score})` : ""}`,
      tenantId: p.userId ?? null,
      tenantEmail: null,
      actorEmail: null,
      ip: null,
      refId: p.customerId ?? null,
      at: p.createdAt,
    });
  }
  for (const a of audits as any[]) {
    events.push({
      id: `audit:${a.id}`,
      source: "admin_audit",
      type: a.action,
      severity: "info",
      summary: `${a.action}${a.targetType ? ` · ${a.targetType}` : ""}`,
      tenantId: a.userId ?? null,
      tenantEmail: null,
      actorEmail: a.actorEmail ?? null,
      ip: a.ip ?? null,
      refId: a.targetId ?? null,
      at: a.at,
    });
  }
  // Aggregate API errors per (user,status) to avoid a wall of rows.
  const apiAgg = new Map<string, { count: number; last: Date; userId: string; status: number }>();
  for (const e of apiErrors as any[]) {
    const key = `${e.userId}:${e.status}`;
    const cur = apiAgg.get(key);
    if (cur) { cur.count++; if (e.createdAt > cur.last) cur.last = e.createdAt; }
    else apiAgg.set(key, { count: 1, last: e.createdAt, userId: e.userId, status: e.status });
  }
  for (const [key, v] of apiAgg) {
    events.push({
      id: `api:${key}`,
      source: "api_error",
      type: `http_${v.status}`,
      severity: v.status >= 500 ? "warn" : "info",
      summary: `${v.count} استجابة API بحالة ${v.status}`,
      tenantId: v.userId,
      tenantEmail: null,
      actorEmail: null,
      ip: null,
      refId: null,
      at: v.last,
    });
  }

  // Apply severity filter uniformly (protection already filtered above).
  let filtered = f.severity ? events.filter((e) => e.severity === f.severity) : events;
  filtered.sort((a, b) => b.at.getTime() - a.at.getTime());

  // Resolve tenant emails (bounded).
  const ids = Array.from(new Set(filtered.map((e) => e.tenantId).filter(Boolean))) as string[];
  if (ids.length) {
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } }).catch(() => []);
    const map = new Map(users.map((u) => [u.id, u.email]));
    for (const e of filtered) if (e.tenantId) e.tenantEmail = map.get(e.tenantId) ?? null;
  }

  const counts = { critical: 0, warn: 0, info: 0, total: filtered.length };
  for (const e of filtered) counts[e.severity]++;

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return {
    generatedAt: new Date(now).toISOString(),
    availability: { protectionLogs: true, adminAudit: true, apiErrors: true, failedLogins: false },
    counts,
    events: paged,
    page,
    pageSize,
    pages,
  };
}

/** Compact security signal for the Command Center — only when there is a real spike. */
export async function getSecurityAttention(): Promise<{ criticalProtection24h: number; unresolvedCritical: number }> {
  const dayAgo = new Date(Date.now() - 86_400_000);
  const criticalProtection24h = await (prisma as any).protectionLog
    ?.count({ where: { severity: "critical", createdAt: { gte: dayAgo } } })
    .catch(() => 0) ?? 0;
  return { criticalProtection24h, unresolvedCritical: criticalProtection24h };
}
