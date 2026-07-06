/**
 * lib/developer/metering.ts — API usage tracking, metrics, and abuse detection.
 *
 * Every API-key request appends an ApiRequestLog row and increments a per-key
 * per-day ApiUsageDaily rollup (cheap dashboards). Best-effort: metering never
 * breaks a request.
 */

import { prisma } from "@/lib/db";

function utcDay(d = new Date()): string { return d.toISOString().slice(0, 10); }

export async function meterApiRequest(args: {
  userId: string; apiKeyId: string; method: string; path: string; status: number; latencyMs: number; ip?: string | null;
}): Promise<void> {
  const day = utcDay();
  const isError = args.status >= 400;
  try {
    await prisma.$transaction([
      prisma.apiRequestLog.create({
        data: { userId: args.userId, apiKeyId: args.apiKeyId, method: args.method.slice(0, 10), path: args.path.slice(0, 300), status: args.status, latencyMs: Math.max(0, Math.round(args.latencyMs)), ip: args.ip ? String(args.ip).slice(0, 64) : null },
      }),
      prisma.apiUsageDaily.upsert({
        where: { apiKeyId_day: { apiKeyId: args.apiKeyId, day } },
        create: { userId: args.userId, apiKeyId: args.apiKeyId, day, requests: 1, errors: isError ? 1 : 0 },
        update: { requests: { increment: 1 }, errors: isError ? { increment: 1 } : undefined, lastAt: new Date() },
      }),
      prisma.apiKey.update({ where: { id: args.apiKeyId }, data: { lastUsedAt: new Date() } }),
    ]);
  } catch {
    /* best-effort */
  }
}

export interface KeyUsageSummary {
  apiKeyId: string; requests: number; errors: number; errorRatePct: number;
}

/** Per-key usage over a window (for the developer usage dashboard). */
export async function getKeyUsage(userId: string, { days = 30 }: { days?: number } = {}) {
  const since = new Date(Date.now() - Math.max(1, days) * 86400000).toISOString().slice(0, 10);
  const rows = await prisma.apiUsageDaily.groupBy({
    by: ["apiKeyId"], where: { userId, day: { gte: since } },
    _sum: { requests: true, errors: true },
  }).catch(() => [] as any[]);
  const perKey: KeyUsageSummary[] = rows.map((r: any) => {
    const req = r._sum?.requests || 0; const err = r._sum?.errors || 0;
    return { apiKeyId: r.apiKeyId, requests: req, errors: err, errorRatePct: req > 0 ? Math.round((err / req) * 100) : 0 };
  });
  const totalRequests = perKey.reduce((s, k) => s + k.requests, 0);
  const totalErrors = perKey.reduce((s, k) => s + k.errors, 0);

  // Daily series (platform-agnostic, per tenant) for the chart.
  const daily = await prisma.apiUsageDaily.groupBy({
    by: ["day"], where: { userId, day: { gte: since } },
    _sum: { requests: true, errors: true }, orderBy: { day: "asc" },
  }).catch(() => [] as any[]);
  const series = daily.map((d: any) => ({ day: d.day, requests: d._sum?.requests || 0, errors: d._sum?.errors || 0 }));

  return { days, totalRequests, totalErrors, errorRatePct: totalRequests > 0 ? Math.round((totalErrors / totalRequests) * 100) : 0, perKey, series };
}

export async function recentRequests(userId: string, { take = 50 }: { take?: number } = {}) {
  return prisma.apiRequestLog.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: Math.min(take, 200) });
}

/** Admin abuse detection: keys with high volume or high error rate in the window. */
export async function detectAbuse({ days = 1, minRequests = 1000, errorRatePct = 40 }: { days?: number; minRequests?: number; errorRatePct?: number } = {}) {
  const since = new Date(Date.now() - Math.max(1, days) * 86400000).toISOString().slice(0, 10);
  const rows = await prisma.apiUsageDaily.groupBy({
    by: ["apiKeyId", "userId"], where: { day: { gte: since } },
    _sum: { requests: true, errors: true },
  }).catch(() => [] as any[]);
  const flagged = rows.map((r: any) => {
    const req = r._sum?.requests || 0; const err = r._sum?.errors || 0;
    const rate = req > 0 ? Math.round((err / req) * 100) : 0;
    const reasons: string[] = [];
    if (req >= minRequests) reasons.push("high_volume");
    if (rate >= errorRatePct && req >= 50) reasons.push("high_error_rate");
    return { apiKeyId: r.apiKeyId, userId: r.userId, requests: req, errors: err, errorRatePct: rate, reasons };
  }).filter((r) => r.reasons.length > 0).sort((a, b) => b.requests - a.requests);
  return flagged;
}
