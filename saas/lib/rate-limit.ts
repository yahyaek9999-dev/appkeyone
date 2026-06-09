// In-memory token-bucket / sliding-window rate limiter.
// Suitable for single-process Node.js (Next.js standalone) on a VPS.
// For multi-instance setups, replace store with Redis.

import { NextRequest, NextResponse } from "next/server";

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

// Periodic GC to prevent memory bloat
const GC_INTERVAL_MS = 5 * 60 * 1000;
let gcTimer: NodeJS.Timeout | null = null;
function startGc() {
  if (gcTimer) return;
  gcTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store) if (v.resetAt < now) store.delete(k);
  }, GC_INTERVAL_MS);
  // Allow process to exit even with timer pending
  if (gcTimer && typeof gcTimer.unref === "function") gcTimer.unref();
}

export type RateLimitOptions = {
  /** Unique name (e.g. "chat", "login"). */
  name: string;
  /** Maximum allowed requests in the window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
  /** Override identifier; falls back to IP address. */
  identifier?: string;
};

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
};

export function getClientIp(req: NextRequest | Request): string {
  const h = (req as NextRequest).headers;
  const xff = h.get("x-forwarded-for");
  if (xff) {
    // SECURITY: X-Forwarded-For is client-appendable. The LEFTMOST entry is
    // attacker-controlled, so keying on it lets an attacker mint a fresh
    // rate-limit bucket per forged IP and bypass brute-force protection.
    // Trust only the entry inserted by our own proxies: with TRUSTED_PROXY_COUNT
    // reverse proxies in front (default 1 = Caddy), the real client is the
    // entry `count` positions from the right.
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) {
      const hops = Math.max(1, parseInt(process.env.TRUSTED_PROXY_COUNT || "1", 10));
      const idx = parts.length - hops;
      return parts[idx >= 0 ? idx : parts.length - 1]!;
    }
  }
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  // @ts-expect-error - Next provides ip on the underlying Request in node runtime
  return req.ip || "unknown";
}

export function rateLimit(
  req: NextRequest | Request,
  opts: RateLimitOptions
): RateLimitResult {
  startGc();
  const id = opts.identifier || getClientIp(req);
  const key = `${opts.name}:${id}`;
  const now = Date.now();
  const windowMs = opts.windowSec * 1000;

  const existing = store.get(key);
  if (!existing || existing.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return {
      ok: true,
      remaining: opts.limit - 1,
      resetAt: now + windowMs,
      retryAfterSec: 0,
    };
  }

  existing.count += 1;
  const remaining = Math.max(0, opts.limit - existing.count);
  const ok = existing.count <= opts.limit;
  const retryAfterSec = ok ? 0 : Math.ceil((existing.resetAt - now) / 1000);
  return { ok, remaining, resetAt: existing.resetAt, retryAfterSec };
}

export function buildLimitHeaders(
  res: RateLimitResult,
  limit: number
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(res.remaining),
    "X-RateLimit-Reset": String(Math.ceil(res.resetAt / 1000)),
    ...(res.retryAfterSec > 0 ? { "Retry-After": String(res.retryAfterSec) } : {}),
  };
}

/** Helper that returns a 429 NextResponse when limited, else null. */
export function enforceRateLimit(
  req: NextRequest | Request,
  opts: RateLimitOptions
): NextResponse | null {
  const r = rateLimit(req, opts);
  if (r.ok) return null;
  return NextResponse.json(
    {
      error: "تم تجاوز عدد الطلبات المسموح به. حاول بعد قليل.",
      retryAfter: r.retryAfterSec,
    },
    { status: 429, headers: buildLimitHeaders(r, opts.limit) }
  );
}

// Sensible defaults per endpoint family
export const RATE_LIMITS = {
  auth: { limit: 10, windowSec: 60 }, // login/signup: 10 per minute per IP
  chat: { limit: 30, windowSec: 60 }, // chat: 30 per minute per IP
  api: { limit: 60, windowSec: 60 }, // general API: 60 per minute
  admin: { limit: 120, windowSec: 60 }, // admin: 120 per minute
  whatsapp: { limit: 300, windowSec: 60 }, // whatsapp webhooks: 300 per minute
} as const;
