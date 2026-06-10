// Universal Providers — resolve → execute → failover (server-only).
//
// Domain-agnostic engine. Each domain service supplies a `run(provider)`
// callback that performs the actual fetch and throws on failure (ideally an
// IntegrationError carrying .status/.retryable). This loop:
//   - resolves enabled providers in priority order (vault ⊕ legacy ⊕ env)
//   - tries each in turn; on retryable/non-retryable failure advances to next
//   - records usage + health + ProviderCallLog for every attempt
//   - returns a graceful-disabled result (never throws) when nothing is
//     configured or every provider failed, so one tenant's missing key never
//     breaks a request path or affects another tenant.

import { loadEnabledResolved, setHealth } from "./vault";
import { recordProviderCall } from "./usage";
import { bump } from "@/lib/metrics";
import {
  isRetryableStatus,
  type FailoverResult,
  type ProviderDomain,
  type ProviderOperation,
  type ResolvedProvider,
} from "./types";

/** A provider is considered "down" only for this long before we re-probe it. */
const HEALTH_TTL_MS = 5 * 60 * 1000;

export type ResolveOpts = {
  /** Legacy per-domain credentials appended after vault (vault wins on dupes). */
  appendLegacy?: () => Promise<ResolvedProvider[]> | ResolvedProvider[];
  /** Platform env fallback, used only when nothing else is configured. */
  appendEnv?: () => ResolvedProvider[];
};

/** Ordered list of executable providers for a tenant+domain. */
export async function resolveProviders(
  userId: string,
  domain: ProviderDomain,
  opts: ResolveOpts = {},
): Promise<ResolvedProvider[]> {
  const vault = await loadEnabledResolved(userId, domain).catch(() => [] as ResolvedProvider[]);
  const seen = new Set(vault.map((p) => p.provider));

  let legacy: ResolvedProvider[] = [];
  if (opts.appendLegacy) {
    try {
      legacy = (await opts.appendLegacy()) || [];
    } catch {
      legacy = [];
    }
    legacy = legacy.filter((p) => !seen.has(p.provider));
    legacy.forEach((p) => seen.add(p.provider));
  }

  const merged = [...vault, ...legacy];
  if (merged.length === 0 && opts.appendEnv) {
    try {
      return opts.appendEnv() || [];
    } catch {
      return [];
    }
  }
  return merged;
}

export type RunOpts<T> = ResolveOpts & {
  operation: ProviderOperation;
  /** Skip providers currently marked "down" (re-probed after HEALTH_TTL_MS). */
  healthGate?: boolean;
  /** Extract token usage from a successful result (AI domain) for cost tracking. */
  meta?: (result: T) => { inputTokens?: number; outputTokens?: number };
  /** Restrict to providers matching a predicate (e.g. image generate vs analyze). */
  filter?: (p: ResolvedProvider) => boolean;
};

function statusOf(e: any): number {
  const s = Number(e?.status);
  return Number.isFinite(s) ? s : 0;
}

function retryableOf(e: any): boolean {
  if (typeof e?.retryable === "boolean") return e.retryable;
  const s = statusOf(e);
  if (s) return isRetryableStatus(s);
  // network/abort → retryable (worth trying the next provider)
  const name = e?.name || "";
  const code = e?.code || "";
  return name === "AbortError" || code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND";
}

/**
 * Execute `run` against the tenant's providers with cross-provider failover.
 * Returns the first success, or a graceful-disabled result. Never throws.
 */
export async function runWithFailover<T>(
  userId: string,
  domain: ProviderDomain,
  run: (provider: ResolvedProvider) => Promise<T>,
  opts: RunOpts<T>,
): Promise<FailoverResult<T>> {
  let providers = await resolveProviders(userId, domain, opts);
  if (opts.filter) providers = providers.filter(opts.filter);
  if (providers.length === 0) {
    return { ok: false, disabled: true, reason: "no_provider_configured" };
  }

  const healthGate = opts.healthGate !== false;
  const now = Date.now();
  let lastDetail = "";
  let attempts = 0;

  for (let i = 0; i < providers.length; i++) {
    const p = providers[i]!;

    // Skip a freshly-failed provider unless its "down" mark is stale.
    if (
      healthGate &&
      p.source === "vault" &&
      p.status === "down" &&
      p.lastCheckAt &&
      now - new Date(p.lastCheckAt).getTime() < HEALTH_TTL_MS &&
      i < providers.length - 1 // never skip the last remaining option
    ) {
      continue;
    }

    attempts++;
    const willFailoverIfError = i < providers.length - 1;
    const t0 = Date.now();
    try {
      const result = await run(p);
      const usage = opts.meta?.(result) || {};
      recordProviderCall({
        userId,
        domain,
        provider: p.provider,
        operation: opts.operation,
        ok: true,
        latencyMs: Date.now() - t0,
        failedOver: i > 0,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });
      if (p.credId) void setHealth(p.credId, "healthy", "");
      return { ok: true, provider: p.provider, source: p.source, result, attempts };
    } catch (e: any) {
      const status = statusOf(e);
      const retryable = retryableOf(e);
      lastDetail = String(e?.message || "request failed").slice(0, 300);
      recordProviderCall({
        userId,
        domain,
        provider: p.provider,
        operation: opts.operation,
        ok: false,
        status,
        latencyMs: Date.now() - t0,
        error: lastDetail,
        failedOver: willFailoverIfError,
      });
      if (p.credId) {
        // Auth/validation failures mark the provider down; transient → degraded.
        void setHealth(p.credId, retryable ? "degraded" : "down", lastDetail);
      }
      if (willFailoverIfError) bump("provider_fallback", userId);
      // Always advance to the next provider (cross-provider failover).
    }
  }

  return { ok: false, disabled: true, reason: "all_providers_failed", detail: lastDetail };
}
