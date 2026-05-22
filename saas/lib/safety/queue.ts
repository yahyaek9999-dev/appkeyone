// Smart Queue — schedules outbound sends with per-contact spacing,
// per-session spacing, jitter, and adaptive concurrency.
//
// Used by:
//   * the broadcast worker to drain queued sends without bursting
//   * the chat handler when stage `replyOnly` blocks an immediate reply
//
// In-memory only (the *content* is already in DB via BroadcastItem).
// We just add a delay scheduler so the consumer wakes up at safe times.
import { loadState } from "./store";
import { getStageLimits } from "./warmup";

interface PerContactSlot {
  phone: string;
  lastSentAt: number;
}

const PER_CONTACT_MIN_SPACING_MS = 4 * 3_600_000; // 4h between broadcast sends to same phone
const PER_SESSION_MIN_SPACING_MS = 6_000;          // 6s between any two sends
const JITTER_RANGE_MS = 4_000;                     // ±4s jitter

interface SendPacingOptions {
  perContactSpacingMs?: number;
  jitterRangeMs?: number;
}

const perContact = new Map<string, Map<string, number>>(); // userId -> phone -> ts
const perSession = new Map<string, number>();              // userId -> last send ts

/** Compute the earliest safe time to send to this phone for this user. */
export function nextAllowedSendAt(
  userId: string,
  phone: string,
  basis = Date.now(),
  options: SendPacingOptions = {},
): number {
  const perContactSpacingMs = options.perContactSpacingMs ?? PER_CONTACT_MIN_SPACING_MS;
  const jitterRangeMs = options.jitterRangeMs ?? JITTER_RANGE_MS;
  const userMap = perContact.get(userId);
  const lastToPhone = userMap?.get(phone) || 0;
  const earliestForPhone = perContactSpacingMs > 0
    ? lastToPhone + perContactSpacingMs
    : 0;
  const lastForSession = perSession.get(userId) || 0;
  const earliestForSession = lastForSession + PER_SESSION_MIN_SPACING_MS;
  const jitter = jitterRangeMs > 0
    ? Math.floor((Math.random() * 2 - 1) * jitterRangeMs)
    : 0;
  return Math.max(basis, earliestForPhone, earliestForSession) + jitter;
}

export function recordSent(userId: string, phone: string, at = Date.now()): void {
  let userMap = perContact.get(userId);
  if (!userMap) { userMap = new Map(); perContact.set(userId, userMap); }
  userMap.set(phone, at);
  perSession.set(userId, at);
  // Bound memory: drop entries older than 12h on each write
  const cutoff = at - 12 * 3_600_000;
  if (userMap.size > 500) {
    for (const [p, t] of userMap) if (t < cutoff) userMap.delete(p);
  }
}

/** Compute adaptive concurrency for a broadcast given the current safety state. */
export async function adaptiveConcurrency(userId: string): Promise<number> {
  const state = await loadState(userId);
  const limits = getStageLimits(state.warmupStage);
  // Base = 1 send at a time. Allow up to N if mature + healthy.
  if (state.killSwitchActive) return 0;
  if (state.cooldownUntil && new Date(state.cooldownUntil).getTime() > Date.now()) return 0;
  if (state.warmupStage === "day1" || state.warmupStage === "day2_3") return 1;
  if (state.warmupStage === "day4_5") return 1;
  if (state.warmupStage === "day6_7") return 2;
  if (state.warmupStage === "week2") return 2;
  // Mature + low risk → up to 3
  if (state.riskScore < 30) return 3;
  if (state.riskScore < 60) return 2;
  return 1;
}

/** Recommended ms between sends in this user's broadcast worker.
 *  Bounded to keep throughput sane during spikes and prevent starvation. */
export async function broadcastIntervalMs(userId: string): Promise<number> {
  const state = await loadState(userId);
  const limits = getStageLimits(state.warmupStage);
  // Spread daily budget evenly across 10 working hours.
  const workingMs = 10 * 3_600_000;
  const base = workingMs / Math.max(1, limits.maxDaily);
  // Adjust for risk: high risk = longer waits (capped to avoid huge delays).
  const riskFactor = Math.min(2.2, 1 + state.riskScore / 100);
  // Add 30% jitter
  const jitter = 0.7 + Math.random() * 0.6;
  // Hard min/max bounds. Mature accounts shouldn't wait > 90s between sends
  // during normal operation; day1 accounts shouldn't go below 8s.
  const MIN_MS = state.warmupStage === "day1" || state.warmupStage === "day2_3" ? 8_000 : 4_000;
  const MAX_MS = 90_000;
  return Math.max(MIN_MS, Math.min(MAX_MS, Math.round(base * riskFactor * jitter)));
}
