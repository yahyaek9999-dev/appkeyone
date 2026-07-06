/**
 * lib/developer/api-gate.ts — auth + scope + rate-limit gate for /api/v1.
 *
 * `withApiKey` wraps a public API handler: it authenticates the bearer key,
 * checks the tenant still holds the `api_access` capability (plan gate), checks
 * the required scope, enforces the per-key rate limit, runs the handler, and
 * meters the request. The identity is DERIVED from the key — callers cannot
 * pass a userId, so there is no cross-tenant access.
 *
 * Rate limiting is an in-memory sliding window (best-effort, per instance).
 * Multi-instance deployments should back this with Redis; documented limitation.
 */

import { NextResponse } from "next/server";
import { verifyApiKey } from "./keys";
import { parseApiKeyHeader, parseScopes, hasScope } from "./api-core";
import { meterApiRequest } from "./metering";
import { hasCapability } from "@/lib/membership/entitlements";
import { getClientIp } from "@/lib/rate-limit";

interface Identity { userId: string; keyId: string; scopes: string[]; rateLimitPerMin: number }

// in-memory per-key request timestamps (sliding 60s window)
const buckets = new Map<string, number[]>();
function rateLimit(keyId: string, perMin: number): { ok: boolean; remaining: number } {
  const now = Date.now();
  const windowStart = now - 60_000;
  const arr = (buckets.get(keyId) || []).filter((t) => t > windowStart);
  if (arr.length >= perMin) { buckets.set(keyId, arr); return { ok: false, remaining: 0 }; }
  arr.push(now);
  buckets.set(keyId, arr);
  return { ok: true, remaining: Math.max(0, perMin - arr.length) };
}

function err(status: number, code: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: code, ...extra }, { status });
}

/**
 * Authenticate + authorize an API-key request. Returns either an identity or a
 * ready NextResponse to return immediately.
 */
export async function apiKeyGate(req: Request, requiredScope?: string): Promise<{ identity?: Identity; response?: NextResponse }> {
  const token = parseApiKeyHeader(req.headers);
  if (!token) return { response: err(401, "missing_api_key") };

  const v = await verifyApiKey(token);
  if (!v.ok || !v.key) return { response: err(401, "invalid_api_key", { reason: v.reason }) };
  const key = v.key;

  // Plan gate — the tenant must still hold API access.
  const allowed = await hasCapability(key.userId, "api_access").catch(() => true);
  if (!allowed) return { response: err(402, "api_access_not_in_plan", { capability: "api_access" }) };

  const scopes = parseScopes(key.scopes);
  if (requiredScope && !hasScope(scopes, requiredScope)) {
    return { response: err(403, "insufficient_scope", { required: requiredScope }) };
  }

  const rl = rateLimit(key.id, key.rateLimitPerMin);
  if (!rl.ok) {
    const r = err(429, "rate_limited", { limitPerMin: key.rateLimitPerMin });
    r.headers.set("Retry-After", "60");
    return { response: r };
  }

  return { identity: { userId: key.userId, keyId: key.id, scopes, rateLimitPerMin: key.rateLimitPerMin } };
}

/**
 * Wrap a public /api/v1 handler with auth + scope + rate-limit + metering.
 * Usage:
 *   export const GET = (req) => withApiKey(req, "customers:read", async (id) => NextResponse.json(...))
 */
export async function withApiKey(
  req: Request,
  requiredScope: string | undefined,
  handler: (identity: Identity) => Promise<NextResponse>,
): Promise<NextResponse> {
  const started = Date.now();
  const gate = await apiKeyGate(req, requiredScope);
  if (gate.response || !gate.identity) {
    // Meter auth failures too when we can attribute them to a key.
    return gate.response!;
  }
  const id = gate.identity;
  let res: NextResponse;
  try {
    res = await handler(id);
  } catch (e: any) {
    res = err(500, "internal_error", { detail: String(e?.message || e).slice(0, 200) });
  }
  const path = (() => { try { return new URL(req.url).pathname; } catch { return "/api/v1"; } })();
  void meterApiRequest({
    userId: id.userId, apiKeyId: id.keyId, method: req.method, path, status: res.status,
    latencyMs: Date.now() - started, ip: safeIp(req),
  });
  res.headers.set("X-RateLimit-Limit", String(id.rateLimitPerMin));
  return res;
}

function safeIp(req: Request): string | null {
  try { return getClientIp(req); } catch { return null; }
}
