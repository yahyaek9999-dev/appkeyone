// Anti-Ban Human Behavior Layer.
//
// Sits between humanize.ts (which produces base delays/text) and the
// JSON response we send to whatsapp-service. Scales delays, throttles
// bursts, simulates circadian rhythms, and flags risky activity per bot.
//
// All state is in-process Maps, bounded, O(1) per call, GC-friendly.
// Nothing here calls the LLM or any external service.

import { createHash } from "crypto";
import { priorityDelayFactor } from "./fast-path";

// ---------------------------------------------------------------------------
// Tunables (env-overridable, conservative defaults)
// ---------------------------------------------------------------------------

const WINDOW_MIN_MS         = 60_000;          // 1 minute rolling window
const WINDOW_10MIN_MS       = 10 * 60_000;
const MAX_PER_MIN_BASE      = Math.max(6,  Number(process.env.ANTI_BAN_PER_MIN  || 12));
const MAX_PER_10MIN_BASE    = Math.max(40, Number(process.env.ANTI_BAN_PER_10M  || 80));
const MAX_UNIQUE_PER_10MIN  = Math.max(15, Number(process.env.ANTI_BAN_NEW_CHATS_10M || 25));
const DAILY_SOFT_CAP        = Math.max(200,Number(process.env.ANTI_BAN_DAILY_SOFT_CAP || 600));
const COOLDOWN_BASE_MS      = Math.max(30_000, Number(process.env.ANTI_BAN_COOLDOWN_MS || 90_000));
const REPETITION_RING       = 8;               // last N replies hashed for dup detect
const SHORT_INTERVAL_MS     = 1500;            // consecutive sends to SAME customer below this = suspicious
const MAX_TRACKED_BOTS      = 1000;            // hard memory cap

// Idle "human pauses" — never always, just occasionally
const MICRO_IDLE_CHANCE     = 0.07;            // 7% of replies add a small extra pause
const LONG_IDLE_CHANCE      = 0.012;           // 1.2% add a longer "got distracted" pause
const MICRO_IDLE_MIN        = 1200;
const MICRO_IDLE_MAX        = 3500;
const LONG_IDLE_MIN         = 6000;
const LONG_IDLE_MAX         = 14000;

// ---------------------------------------------------------------------------
// State per bot/user (account)
// ---------------------------------------------------------------------------

interface BotState {
  sendsTs: number[];                          // rolling timestamps (last 10 min)
  perCustomerLastTs: Map<string, number>;     // phone → last send ts
  recipientsRecent: Map<string, number>;      // phone → last seen ts (10 min)
  recentReplyHashes: string[];                // ring of last reply hashes
  cooldownUntil: number;
  dailySends: number;
  dailyResetAt: number;
  lastUpdatedAt: number;
}

const bots = new Map<string, BotState>();

function nowMs(): number { return Date.now(); }

function ringPush(arr: string[], v: string, cap = REPETITION_RING) {
  arr.push(v);
  if (arr.length > cap) arr.shift();
}

function pruneIfOversize() {
  if (bots.size <= MAX_TRACKED_BOTS) return;
  // Evict the least-recently-updated bot
  let oldestId: string | null = null;
  let oldestTs = Infinity;
  bots.forEach((s, id) => {
    if (s.lastUpdatedAt < oldestTs) { oldestTs = s.lastUpdatedAt; oldestId = id; }
  });
  if (oldestId) bots.delete(oldestId);
}

function getState(userId: string): BotState {
  let s = bots.get(userId);
  const now = nowMs();
  if (!s) {
    s = {
      sendsTs: [],
      perCustomerLastTs: new Map(),
      recipientsRecent: new Map(),
      recentReplyHashes: [],
      cooldownUntil: 0,
      dailySends: 0,
      dailyResetAt: now + 24 * 3_600_000,
      lastUpdatedAt: now,
    };
    bots.set(userId, s);
    pruneIfOversize();
  }
  // Day rollover
  if (now > s.dailyResetAt) {
    s.dailySends = 0;
    s.dailyResetAt = now + 24 * 3_600_000;
  }
  // Window cleanup (cheap — bounded by max per-bot send rate)
  const cutoff = now - WINDOW_10MIN_MS;
  while (s.sendsTs.length && s.sendsTs[0] < cutoff) s.sendsTs.shift();
  s.recipientsRecent.forEach((ts, phone) => {
    if (ts < cutoff) s.recipientsRecent.delete(phone);
  });
  // Audit fix: perCustomerLastTs was unbounded — prune with same cutoff so
  // long-running bots don't accumulate entries for every customer ever talked to.
  s.perCustomerLastTs.forEach((ts, phone) => {
    if (ts < cutoff) s.perCustomerLastTs.delete(phone);
  });
  return s;
}

// ---------------------------------------------------------------------------
// Risk scoring
// ---------------------------------------------------------------------------

export type RiskLevel = "low" | "medium" | "high" | "cooldown";

interface RiskReport {
  level: RiskLevel;
  score: number;          // 0-100
  reasons: string[];
  multiplier: number;     // delay multiplier applied to base delays
  forcedCooldownMs: number; // >0 means refuse to send
}

function scoreRisk(s: BotState, now: number, phone: string, replyHash: string): RiskReport {
  const reasons: string[] = [];
  let score = 0;

  // 1) burst per minute
  const lastMin = s.sendsTs.filter((t) => t >= now - WINDOW_MIN_MS).length;
  if (lastMin >= MAX_PER_MIN_BASE)        { score += 35; reasons.push("burst_1min"); }
  else if (lastMin >= MAX_PER_MIN_BASE * 0.7) { score += 15; reasons.push("near_burst_1min"); }

  // 2) burst per 10 min
  if (s.sendsTs.length >= MAX_PER_10MIN_BASE)        { score += 25; reasons.push("burst_10min"); }
  else if (s.sendsTs.length >= MAX_PER_10MIN_BASE * 0.7) { score += 10; reasons.push("near_burst_10min"); }

  // 3) new-chat fanout
  const uniqueRecent = s.recipientsRecent.size;
  if (uniqueRecent > MAX_UNIQUE_PER_10MIN)            { score += 20; reasons.push("many_new_chats"); }

  // 4) very short interval to same customer
  const lastToCustomer = s.perCustomerLastTs.get(phone) || 0;
  if (lastToCustomer && now - lastToCustomer < SHORT_INTERVAL_MS) {
    score += 15; reasons.push("rapid_same_customer");
  }

  // 5) repeated identical replies
  const dupCount = s.recentReplyHashes.filter((h) => h === replyHash).length;
  if (dupCount >= 3)      { score += 25; reasons.push("repeated_replies"); }
  else if (dupCount >= 2) { score += 10; reasons.push("near_repetition"); }

  // 6) abnormal hours (server local 1am-5am)
  const hour = new Date(now).getHours();
  if (hour >= 1 && hour <= 5) { score += 8; reasons.push("late_night"); }

  // 7) daily soft cap
  if (s.dailySends > DAILY_SOFT_CAP)             { score += 20; reasons.push("daily_soft_cap"); }
  else if (s.dailySends > DAILY_SOFT_CAP * 0.8)  { score += 8;  reasons.push("near_daily_cap"); }

  // 8) already in cooldown
  if (now < s.cooldownUntil) {
    return {
      level: "cooldown",
      score: 100,
      reasons: ["active_cooldown", ...reasons],
      multiplier: 1,
      forcedCooldownMs: s.cooldownUntil - now,
    };
  }

  // Map score → level + delay multiplier + maybe trigger cooldown
  let level: RiskLevel = "low";
  let multiplier = 1.0;
  let forcedCooldownMs = 0;

  if (score >= 75) {
    level = "cooldown";
    forcedCooldownMs = COOLDOWN_BASE_MS + Math.floor(Math.random() * COOLDOWN_BASE_MS);
    s.cooldownUntil = now + forcedCooldownMs;
  } else if (score >= 45) {
    level = "high";
    multiplier = 2.2 + Math.random() * 0.8;
  } else if (score >= 20) {
    level = "medium";
    multiplier = 1.4 + Math.random() * 0.4;
  } else {
    multiplier = 1 + Math.random() * 0.2;
  }

  return { level, score: Math.min(100, score), reasons, multiplier, forcedCooldownMs };
}

// ---------------------------------------------------------------------------
// Circadian factor — slow the bot down at "human sleep" hours.
// Server time only (we don't store per-tenant timezone). Conservative.
// ---------------------------------------------------------------------------

function circadianFactor(now: number): number {
  const h = new Date(now).getHours();
  if (h >= 1 && h <= 5)  return 1.8 + Math.random() * 0.6; // deep night
  if (h === 0 || h === 6) return 1.3 + Math.random() * 0.3;
  if (h >= 12 && h <= 14) return 1.0 + Math.random() * 0.15; // lunch slight slowdown
  return 1.0;
}

// ---------------------------------------------------------------------------
// Public API — called by the webhook just before responding.
// ---------------------------------------------------------------------------

export interface AssessInput {
  userId: string;
  customerPhone: string;
  reply: string;
  basePreDelayMs: number;
  baseTypingDelayMs: number;
  /**
   * Optional priority hint (0-100) computed via fast-path.computePriority.
   * Higher priority shortens delays for hot leads / active negotiations
   * without disabling anti-ban safety. Falls back to 1.0 when omitted.
   */
  priority?: number;
}

export interface AssessResult {
  // delays the webhook should send back to whatsapp-service
  preDelayMs: number;
  typingDelayMs: number;
  idleMs: number;                  // extra "got distracted" pause
  // risk info
  risk: RiskLevel;
  riskScore: number;
  reasons: string[];
  cooldownMs: number;              // if > 0, caller must NOT send
}

/**
 * Inspect the outbound and decide if/when to send. Updates internal state.
 * Returns scaled delays + cooldown signal. Never throws.
 */
export function assessOutbound(i: AssessInput): AssessResult {
  const now = nowMs();
  const s = getState(i.userId);
  const replyHash = hashReply(i.reply);

  const risk = scoreRisk(s, now, i.customerPhone, replyHash);

  if (risk.level === "cooldown") {
    return {
      preDelayMs: 0,
      typingDelayMs: 0,
      idleMs: 0,
      risk: risk.level,
      riskScore: risk.score,
      reasons: risk.reasons,
      cooldownMs: risk.forcedCooldownMs || Math.max(1000, s.cooldownUntil - now),
    };
  }

  // Apply multipliers: risk × circadian × priority-shortener.
  // priorityDelayFactor returns 1.0 for normal traffic and 0.4-0.75 for
  // hot leads / impulse buyers — shortens waits without disabling anti-ban.
  const prFactor = typeof i.priority === "number" ? priorityDelayFactor(i.priority) : 1;
  const mult = risk.multiplier * circadianFactor(now) * prFactor;

  // Add small jitter on top of humanize delays so two identical replies don't
  // produce identical wire delays.
  const jitter = (ms: number) =>
    ms + Math.floor((Math.random() * 0.3 - 0.1) * Math.max(150, ms));

  let preDelayMs    = Math.max(0, Math.round(jitter(i.basePreDelayMs)   * mult));
  let typingDelayMs = Math.max(0, Math.round(jitter(i.baseTypingDelayMs) * mult));

  // Hard caps so we never make a customer wait forever
  preDelayMs    = Math.min(8000, preDelayMs);
  typingDelayMs = Math.min(15000, typingDelayMs);

  // Occasional human "got distracted" pauses
  let idleMs = 0;
  const r = Math.random();
  if (r < LONG_IDLE_CHANCE) {
    idleMs = LONG_IDLE_MIN + Math.floor(Math.random() * (LONG_IDLE_MAX - LONG_IDLE_MIN));
  } else if (r < MICRO_IDLE_CHANCE) {
    idleMs = MICRO_IDLE_MIN + Math.floor(Math.random() * (MICRO_IDLE_MAX - MICRO_IDLE_MIN));
  }

  // Commit state (we ARE sending)
  s.sendsTs.push(now);
  s.perCustomerLastTs.set(i.customerPhone, now);
  s.recipientsRecent.set(i.customerPhone, now);
  ringPush(s.recentReplyHashes, replyHash);
  s.dailySends += 1;
  s.lastUpdatedAt = now;

  return {
    preDelayMs,
    typingDelayMs,
    idleMs,
    risk: risk.level,
    riskScore: risk.score,
    reasons: risk.reasons,
    cooldownMs: 0,
  };
}

function hashReply(s: string): string {
  // Short, cheap, collision-tolerant — we only need it to detect identical
  // text resent rapidly.
  return createHash("sha1").update((s || "").trim().toLowerCase()).digest("base64").slice(0, 12);
}

// ---------------------------------------------------------------------------
// Merchant safety report (for dashboards). No side effects.
// ---------------------------------------------------------------------------

export interface SafetyReport {
  risk: RiskLevel;
  riskScore: number;
  reasons: string[];
  dailySends: number;
  dailyCap: number;
  uniqueRecipients10Min: number;
  sends1Min: number;
  sends10Min: number;
  inCooldown: boolean;
  cooldownRemainingMs: number;
  safeThroughputPerMin: number;     // recommended ceiling now
  recommendedCooldownMs: number;
}

export function getSafetyReport(userId: string): SafetyReport {
  const now = nowMs();
  const s = bots.get(userId);
  if (!s) {
    return {
      risk: "low", riskScore: 0, reasons: [],
      dailySends: 0, dailyCap: DAILY_SOFT_CAP,
      uniqueRecipients10Min: 0, sends1Min: 0, sends10Min: 0,
      inCooldown: false, cooldownRemainingMs: 0,
      safeThroughputPerMin: MAX_PER_MIN_BASE,
      recommendedCooldownMs: 0,
    };
  }
  const sends1Min  = s.sendsTs.filter((t) => t >= now - WINDOW_MIN_MS).length;
  const sends10Min = s.sendsTs.length;
  const risk = scoreRisk(s, now, "", "");
  const inCooldown = now < s.cooldownUntil;
  const safeThroughput =
    risk.level === "high"   ? Math.max(2, Math.floor(MAX_PER_MIN_BASE * 0.4)) :
    risk.level === "medium" ? Math.max(4, Math.floor(MAX_PER_MIN_BASE * 0.7)) :
    MAX_PER_MIN_BASE;

  return {
    risk: risk.level,
    riskScore: risk.score,
    reasons: risk.reasons,
    dailySends: s.dailySends,
    dailyCap: DAILY_SOFT_CAP,
    uniqueRecipients10Min: s.recipientsRecent.size,
    sends1Min,
    sends10Min,
    inCooldown,
    cooldownRemainingMs: Math.max(0, s.cooldownUntil - now),
    safeThroughputPerMin: safeThroughput,
    recommendedCooldownMs:
      risk.level === "high" ? COOLDOWN_BASE_MS : 0,
  };
}

// ---------------------------------------------------------------------------
// Manual cooldown trigger (e.g. when whatsapp-service reports a soft-ban
// signal — auth lost, repeated send failure). Safe no-op if unknown bot.
// ---------------------------------------------------------------------------

export function forceCooldown(userId: string, ms: number): void {
  const s = getState(userId);
  s.cooldownUntil = Math.max(s.cooldownUntil, nowMs() + Math.max(1000, ms));
  s.lastUpdatedAt = nowMs();
}
