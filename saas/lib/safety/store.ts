// Persistent safety state store. Wraps Prisma so the rest of the safety
// engine never touches the DB directly. All counters are reset/decayed
// here so callers stay simple.
import { prisma } from "@/lib/db";
import { createHash } from "crypto";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const RISK_DECAY_PER_MIN = 0.4; // points per minute that drift back toward 0
const EVENT_TTL_MS = DAY_MS;

export type WarmupStage =
  | "day1" | "day2_3" | "day4_5" | "day6_7" | "week2" | "mature";

export interface SafetyStateRow {
  userId: string;
  warmupStartedAt: Date;
  warmupStage: WarmupStage;
  warmupReplyOnly: boolean;
  dailySends: number;
  dailySendsResetAt: Date;
  hourlySends: number;
  hourlyResetAt: Date;
  riskScore: number;
  riskUpdatedAt: Date;
  trustScore: number;
  cooldownUntil: Date | null;
  killSwitchActive: boolean;
  killSwitchReason: string | null;
  killSwitchAt: Date | null;
  recentFailures: number;
  recentReconnects: number;
  failuresResetAt: Date;
  totalSends: number;
  totalFailures: number;
  totalCooldowns: number;
  lastSendAt: Date | null;
}

/** Get-or-create the row + apply time-based rollovers (daily/hourly/decay). */
export async function loadState(userId: string): Promise<SafetyStateRow> {
  const now = new Date();
  let row: any = await prisma.safetyState.findUnique({ where: { userId } });
  if (!row) {
    row = await prisma.safetyState.create({ data: { userId } });
  }
  const updates: any = {};

  // Daily rollover
  if (now.getTime() - new Date(row.dailySendsResetAt).getTime() >= DAY_MS) {
    updates.dailySends = 0;
    updates.dailySendsResetAt = now;
  }
  // Hourly rollover
  if (now.getTime() - new Date(row.hourlyResetAt).getTime() >= HOUR_MS) {
    updates.hourlySends = 0;
    updates.hourlyResetAt = now;
  }
  // Failure-window rollover
  if (now.getTime() - new Date(row.failuresResetAt).getTime() >= HOUR_MS) {
    updates.recentFailures = 0;
    updates.recentReconnects = 0;
    updates.failuresResetAt = now;
  }
  // Risk decay
  const minSinceRisk = (now.getTime() - new Date(row.riskUpdatedAt).getTime()) / 60_000;
  if (minSinceRisk > 1 && row.riskScore > 0) {
    const decayed = Math.max(0, Math.round(row.riskScore - minSinceRisk * RISK_DECAY_PER_MIN));
    if (decayed !== row.riskScore) {
      updates.riskScore = decayed;
      updates.riskUpdatedAt = now;
    }
  }
  if (Object.keys(updates).length > 0) {
    row = await prisma.safetyState.update({ where: { userId }, data: updates });
  }
  return row as SafetyStateRow;
}

export async function patchState(
  userId: string,
  patch: Partial<Record<keyof SafetyStateRow, any>>
): Promise<void> {
  await prisma.safetyState.update({ where: { userId }, data: patch as any });
}

/** Atomic counter increments. Saves a roundtrip vs read-modify-write. */
export async function incrementCounters(
  userId: string,
  inc: {
    dailySends?: number;
    hourlySends?: number;
    totalSends?: number;
    totalFailures?: number;
    totalCooldowns?: number;
    recentFailures?: number;
    recentReconnects?: number;
    riskScore?: number;
  },
  extra?: Partial<Record<keyof SafetyStateRow, any>>
): Promise<void> {
  const data: any = { ...(extra || {}) };
  for (const k of Object.keys(inc) as (keyof typeof inc)[]) {
    const v = inc[k];
    if (typeof v === "number" && v !== 0) {
      data[k] = { increment: v };
    }
  }
  if (Object.keys(data).length === 0) return;
  await prisma.safetyState.update({ where: { userId }, data });
}

export function hashReply(s: string): string {
  return createHash("sha1")
    .update((s || "").trim().toLowerCase())
    .digest("base64")
    .slice(0, 16);
}

// ---------------------------------------------------------------------------
// SafetyEvent — sliding-window log
// ---------------------------------------------------------------------------

export type SafetyEventKind =
  | "send" | "failure" | "cooldown" | "warmup_advance" | "kill"
  | "reply" | "block" | "report" | "reconnect";

export async function logEvent(
  userId: string,
  kind: SafetyEventKind,
  data: {
    customerId?: string | null;
    phone?: string | null;
    replyHash?: string | null;
    riskScore?: number | null;
    payload?: any;
  } = {}
): Promise<void> {
  await prisma.safetyEvent.create({
    data: {
      userId,
      kind,
      customerId: data.customerId ?? null,
      phone: data.phone ?? null,
      replyHash: data.replyHash ?? null,
      riskScore: data.riskScore ?? null,
      payload: JSON.stringify(data.payload || {}),
    },
  });
  // Invalidate the per-user agg cache so the next read picks this up.
  invalidateAggCache(userId);
  // Heavy GC moved to backgroundCleanup() — no per-write delete penalty.
}

/**
 * Background cleanup — removes SafetyEvent rows older than 24h and old
 * SafetyAudit rows older than 30d. Designed to be called from a single
 * setInterval(10 min) at app boot. Idempotent and bounded.
 */
export async function backgroundCleanup(): Promise<{ events: number; audits: number }> {
  const eventCutoff = new Date(Date.now() - EVENT_TTL_MS);
  const auditCutoff = new Date(Date.now() - 30 * DAY_MS);
  let events = 0, audits = 0;
  try {
    const r1 = await prisma.safetyEvent.deleteMany({ where: { createdAt: { lt: eventCutoff } } });
    events = (r1 as any)?.count || 0;
  } catch {}
  try {
    const r2 = await prisma.safetyAudit.deleteMany({ where: { createdAt: { lt: auditCutoff } } });
    audits = (r2 as any)?.count || 0;
  } catch {}
  return { events, audits };
}

export interface RecentSendsAggregate {
  sends1Min: number;
  sends10Min: number;
  sends1Hour: number;
  uniqueRecipients10Min: number;
  recentReplyHashes: string[]; // last N from sends ordered desc
  lastSendToCustomerAt: Map<string, number>;
  failures1Hour: number;
  // Wave 2: real inbound vs outbound ratio (was missing → false positives)
  inbound1Hour: number;
  // Wave 2: failure category split — technical issues shouldn't kill the bot
  techFailures1Hour: number;
  spamFailures1Hour: number;
  // Wave 2: reconnect timing (storm = many in short window)
  reconnects10Min: number;
}

// Cheap in-process cache; recomputed every 30s per user. Kills the cost
// of recomputing the rolling window on every single send for busy bots.
const AGG_CACHE_MS = 30_000;
const aggCache = new Map<string, { at: number; data: RecentSendsAggregate }>();

export async function aggregateRecent(
  userId: string,
  _customerPhones: string[] = []
): Promise<RecentSendsAggregate> {
  const now = Date.now();
  const cached = aggCache.get(userId);
  if (cached && now - cached.at < AGG_CACHE_MS) return cached.data;

  const since = new Date(now - HOUR_MS);
  const events = await prisma.safetyEvent.findMany({
    where: { userId, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 800,
  });
  const t1 = now - 60_000;
  const t10 = now - 10 * 60_000;
  let sends1Min = 0, sends10Min = 0, sends1Hour = 0, failures1Hour = 0;
  let inbound1Hour = 0, techFailures1Hour = 0, spamFailures1Hour = 0, reconnects10Min = 0;
  const recipients10 = new Set<string>();
  const replyHashes: string[] = [];
  const lastByCustomer = new Map<string, number>();
  for (const e of events as any[]) {
    const ts = new Date(e.createdAt).getTime();
    if (e.kind === "send") {
      sends1Hour++;
      if (ts >= t10) { sends10Min++; if (e.phone) recipients10.add(e.phone); }
      if (ts >= t1) sends1Min++;
      if (replyHashes.length < 12 && e.replyHash) replyHashes.push(e.replyHash);
      if (e.phone && !lastByCustomer.has(e.phone)) lastByCustomer.set(e.phone, ts);
    } else if (e.kind === "failure") {
      failures1Hour++;
      // Parse failureKind from payload to classify the failure
      try {
        const p = JSON.parse(e.payload || "{}");
        if (p.kind === "spam" || p.kind === "blocked" || p.kind === "rate_limit") spamFailures1Hour++;
        else techFailures1Hour++;
      } catch { techFailures1Hour++; }
    } else if (e.kind === "reply") {
      inbound1Hour++;
    } else if (e.kind === "reconnect") {
      if (ts >= t10) reconnects10Min++;
    }
  }
  const data: RecentSendsAggregate = {
    sends1Min, sends10Min, sends1Hour,
    uniqueRecipients10Min: recipients10.size,
    recentReplyHashes: replyHashes,
    lastSendToCustomerAt: lastByCustomer,
    failures1Hour, inbound1Hour, techFailures1Hour, spamFailures1Hour,
    reconnects10Min,
  };
  aggCache.set(userId, { at: now, data });
  // Bound cache size
  if (aggCache.size > 200) {
    const cutoff = now - AGG_CACHE_MS * 4;
    for (const [k, v] of aggCache) if (v.at < cutoff) aggCache.delete(k);
  }
  return data;
}

/** Invalidate the cache when a new event is logged so the next read sees fresh data. */
export function invalidateAggCache(userId: string): void {
  aggCache.delete(userId);
}

// ---------------------------------------------------------------------------
// SafetyAudit — admin-readable
// ---------------------------------------------------------------------------

export async function audit(
  level: "info" | "warn" | "critical",
  category: string,
  title: string,
  data: { userId?: string | null; detail?: string; payload?: any } = {}
): Promise<void> {
  await prisma.safetyAudit
    .create({
      data: {
        userId: data.userId ?? null,
        level,
        category,
        title,
        detail: data.detail || "",
        payload: JSON.stringify(data.payload || {}),
      },
    })
    .catch(() => {});
}
