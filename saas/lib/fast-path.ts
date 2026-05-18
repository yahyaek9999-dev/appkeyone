// Fast-path layer.
//
// Provides:
//   - Coalescing of identical in-flight LLM calls (one promise serves many).
//   - Prompt fingerprinting.
//   - Priority hinting for callers that want to favor hot leads.
//
// All zero-deps, in-process, bounded. Never blocks; never throws.

import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// In-flight registry. Each entry maps a prompt fingerprint to a pending
// Promise<string>. Concurrent callers with the same fingerprint await the
// same promise — only ONE scraper call happens.
// ---------------------------------------------------------------------------

type Inflight = { p: Promise<string>; createdAt: number };
const inflight = new Map<string, Inflight>();

const MAX_INFLIGHT = 256;             // hard cap
const INFLIGHT_TTL_MS = 30_000;       // self-prune stale entries

function gcInflight(now: number) {
  // Opportunistic GC: always run when over cap; otherwise run ~1 call in 1000
  // (cheap probabilistic sweep that catches hung promises without burning CPU).
  if (inflight.size <= MAX_INFLIGHT && now % 1000 !== 0) {
    if (Math.random() > 0.001) return;
  }
  inflight.forEach((v, k) => {
    if (now - v.createdAt > INFLIGHT_TTL_MS) inflight.delete(k);
  });
  // Hard cap: drop oldest if still over
  if (inflight.size > MAX_INFLIGHT) {
    const keys = Array.from(inflight.keys()).slice(0, inflight.size - MAX_INFLIGHT);
    for (const k of keys) inflight.delete(k);
  }
}

/**
 * Cheap stable fingerprint of an LLM messages array. Used to coalesce
 * identical concurrent requests.
 */
export function fingerprintMessages(messages: unknown): string {
  const s = (() => {
    try { return JSON.stringify(messages); } catch { return String(messages); }
  })();
  return createHash("sha1").update(s).digest("base64").slice(0, 22);
}

/**
 * Run `factory()` exactly once for a given fingerprint while it's in-flight.
 * Concurrent callers with the same fp receive the SAME pending promise.
 * Resolves/rejects with the factory result — original error semantics preserved.
 */
export async function coalesce<T extends string>(
  fp: string,
  factory: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  gcInflight(now);

  const existing = inflight.get(fp);
  if (existing) return existing.p as unknown as Promise<T>;

  const p = factory().finally(() => {
    // remove from registry as soon as it settles
    inflight.delete(fp);
  });
  inflight.set(fp, { p: p as unknown as Promise<string>, createdAt: now });
  return p;
}

// ---------------------------------------------------------------------------
// Priority hint. Higher = more urgent. Currently informational — the caller
// can use it to bias humanize/anti-ban scaling (e.g. cap delays for hot leads).
// ---------------------------------------------------------------------------

export interface PriorityInput {
  leadScore: number;
  hasBuyStrong: boolean;
  inNegotiation: boolean;
  urgent: boolean;
}

export function computePriority(i: PriorityInput): number {
  let p = 0;
  p += Math.min(60, (i.leadScore || 0));
  if (i.hasBuyStrong)   p += 30;
  if (i.inNegotiation)  p += 20;
  if (i.urgent)         p += 25;
  return Math.min(100, p);
}

/**
 * Translate a priority into a delay-shortening factor [0.4 .. 1.0].
 * 1.0 = no change; 0.4 = aggressively shorten waits for the hottest leads.
 */
export function priorityDelayFactor(priority: number): number {
  if (priority >= 90) return 0.4;
  if (priority >= 70) return 0.55;
  if (priority >= 50) return 0.75;
  return 1.0;
}
