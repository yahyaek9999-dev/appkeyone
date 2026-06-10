// Universal Providers — usage + call logging (server-only, best-effort).
//
// Two sinks, both fire-and-forget (never block or throw into a request path):
//   1) ProviderUsage aggregate via bumpProvider() — reuses the existing per-day
//      per-tenant rollup that getTenantCosts() already turns into USD. We
//      namespace the provider as "domain:provider" so the existing
//      [userId,day,provider,model] unique + cost map keep working unchanged.
//   2) ProviderCallLog append-only rows — powers the dashboard "error logs" and
//      recent-activity panels. Errors are redacted (never secrets).

import { prisma } from "@/lib/db";
import { bumpProvider, bump } from "@/lib/metrics";
import type { ProviderDomain, ProviderOperation } from "./types";

/** Classify a failed provider call by upstream status for transition metrics. */
function errorClassKind(status?: number): string {
  const s = Number(status || 0);
  if (s === 429) return "provider_quota";
  if (s === 401 || s === 403) return "provider_auth_err";
  if (s === 408 || s === 0) return "provider_timeout"; // 408 / abort / network
  return "provider_failure";
}

export type RecordCallInput = {
  userId: string;
  domain: ProviderDomain;
  provider: string;
  operation: ProviderOperation;
  ok: boolean;
  status?: number;
  latencyMs?: number;
  error?: string;
  failedOver?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  /** Suppress writing a ProviderCallLog row (health pings on success are noisy). */
  skipLog?: boolean;
};

const MAX_ERR = 480;

/** Strip anything that could be a secret out of an error string. */
function redactError(s: string): string {
  if (!s) return "";
  return s
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1[redacted]")
    .replace(/(sk-|key-|tok_|AC|SG\.|xkeysib-)[A-Za-z0-9._\-]{6,}/g, "[redacted]")
    .slice(0, MAX_ERR);
}

export function recordProviderCall(input: RecordCallInput): void {
  const { userId, domain, provider } = input;
  if (!userId || !provider) return;

  // 1) Aggregate rollup (namespaced provider so cost/usage dashboards keep working).
  try {
    bumpProvider({
      userId,
      provider: `${domain}:${provider}`,
      model: null,
      success: input.ok,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      latencyMs: input.latencyMs,
    });
  } catch {
    /* swallow — analytics are best-effort */
  }

  // 1b) Fallback-transition observability: count failures by class (timeout /
  //     quota / auth / failure). Fire-and-forget; visible in /admin/metrics.
  if (!input.ok && input.operation !== "health") {
    try {
      bump(errorClassKind(input.status), userId);
    } catch {
      /* swallow */
    }
  }

  // 2) Append-only call log (skip successful health pings to keep the table lean).
  if (input.skipLog || (input.operation === "health" && input.ok)) return;
  (prisma as any).providerCallLog
    ?.create({
      data: {
        userId,
        domain,
        provider,
        operation: input.operation,
        ok: input.ok,
        status: Math.max(0, Math.round(input.status || 0)),
        latencyMs: Math.max(0, Math.round(input.latencyMs || 0)),
        error: redactError(input.error || ""),
        failedOver: !!input.failedOver,
      },
    })
    .catch(() => {});
}

export type ProviderLogRow = {
  id: string;
  domain: string;
  provider: string;
  operation: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  error: string;
  failedOver: boolean;
  createdAt: string;
};

/** Recent call-log rows for a tenant/domain (dashboard error-logs panel). */
export async function recentCalls(
  userId: string,
  domain: ProviderDomain,
  take = 50,
): Promise<ProviderLogRow[]> {
  const rows = await (prisma as any).providerCallLog
    .findMany({
      where: { userId, domain },
      orderBy: { createdAt: "desc" },
      take: Math.min(200, Math.max(1, take)),
    })
    .catch(() => []);
  return (rows as any[]).map((r) => ({
    id: r.id,
    domain: r.domain,
    provider: r.provider,
    operation: r.operation,
    ok: r.ok,
    status: r.status,
    latencyMs: r.latencyMs,
    error: r.error,
    failedOver: r.failedOver,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Per-provider usage slice for a domain (calls/failures/tokens/latency) from ProviderUsage. */
export async function domainUsage(
  userId: string,
  domain: ProviderDomain,
  sinceDays = 30,
): Promise<Record<string, { calls: number; failures: number; inputTokens: number; outputTokens: number; avgLatencyMs: number }>> {
  const since = new Date(Date.now() - sinceDays * 86400_000).toISOString().slice(0, 10);
  const rows = await (prisma as any).providerUsage
    .groupBy({
      by: ["provider"],
      where: { userId, day: { gte: since }, provider: { startsWith: `${domain}:` } },
      _sum: { calls: true, failures: true, inputTokens: true, outputTokens: true, totalLatencyMs: true },
    })
    .catch(() => []);
  const out: Record<string, any> = {};
  for (const r of rows as any[]) {
    const provider = String(r.provider).slice(domain.length + 1); // strip "domain:"
    const calls = r._sum?.calls || 0;
    out[provider] = {
      calls,
      failures: r._sum?.failures || 0,
      inputTokens: r._sum?.inputTokens || 0,
      outputTokens: r._sum?.outputTokens || 0,
      avgLatencyMs: calls > 0 ? Math.round((r._sum?.totalLatencyMs || 0) / calls) : 0,
    };
  }
  return out;
}
