// Universal Providers — health checking (server-only).
//
// Runs a domain service's ping against one stored (or ad-hoc) credential,
// persists the outcome on the credential row, and logs a health call. Used by
// the dashboard "Test connection" button, on save, and by a periodic cron.

import "./register"; // ensure all wired domain services are registered
import { loadOneResolved, setHealth, toResolvedAdHoc } from "./vault";
import { getService } from "./services";
import { recordProviderCall } from "./usage";
import type { ProviderDomain, ResolvedProvider } from "./types";

export type HealthResult = {
  ok: boolean;
  status?: number;
  error?: string;
  /** "no_service" when the domain has not been wired yet (graceful UI message). */
  reason?: "no_service" | "no_credential";
};

async function runPing(p: ResolvedProvider): Promise<HealthResult> {
  const service = getService(p.domain);
  if (!service) return { ok: false, reason: "no_service" };
  const t0 = Date.now();
  try {
    await service.ping(p);
    recordProviderCall({ userId: "", domain: p.domain, provider: p.provider, operation: "health", ok: true, latencyMs: Date.now() - t0, skipLog: true });
    if (p.credId) void setHealth(p.credId, "healthy", "");
    return { ok: true };
  } catch (e: any) {
    const status = Number(e?.status) || 0;
    const error = String(e?.message || "request failed").slice(0, 300);
    if (p.credId) void setHealth(p.credId, status === 401 || status === 403 ? "down" : "degraded", error);
    return { ok: false, status, error };
  }
}

/** Health-check a stored credential by (userId, domain, provider). */
export async function checkStoredHealth(
  userId: string,
  domain: ProviderDomain,
  provider: string,
): Promise<HealthResult> {
  const resolved = await loadOneResolved(userId, domain, provider);
  if (!resolved) return { ok: false, reason: "no_credential" };
  const r = await runPing(resolved);
  if (r.ok) recordProviderCall({ userId, domain, provider, operation: "health", ok: true, skipLog: true });
  else recordProviderCall({ userId, domain, provider, operation: "health", ok: false, status: r.status, error: r.error });
  return r;
}

/**
 * Health-check ad-hoc form values before they are saved (the "Test" button can
 * validate a freshly-typed key without persisting it first).
 */
export async function checkAdHocHealth(
  userId: string,
  domain: ProviderDomain,
  provider: string,
  values: Record<string, string | number | undefined | null>,
): Promise<HealthResult> {
  const resolved = await toResolvedAdHoc(userId, domain, provider, values);
  if (!resolved) return { ok: false, reason: "no_credential" };
  const r = await runPing(resolved);
  recordProviderCall({ userId, domain, provider, operation: "health", ok: r.ok, status: r.status, error: r.error, skipLog: r.ok });
  return r;
}
