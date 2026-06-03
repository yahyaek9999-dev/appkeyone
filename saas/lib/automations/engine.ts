// Visual automation builder — runtime engine (Agent 3, Task #8).
//
// Merchant-authored if-this-then-that rules. This engine is the ONLY place rules
// are evaluated, and it is called EXCLUSIVELY from background paths:
//   • the classify/score tail (after a message is scored)  → score_crossed
//   • the abandoned-cart sweep                              → cart_abandoned
//   • the commerce order-sync path                          → order_status_changed
//   • the automations cron (time-based)                     → idle_hours
//   • stage transitions                                     → stage_changed
// It NEVER runs on the blocking reply path.
//
// Every action routes through an EXISTING safe path:
//   queue_follow_up        → queueSmartFollowUp (protected queue → wa.send)
//   tag_customer           → Customer.tags (no send)
//   notify_admin           → notifyAdmin (wa.send "system")
//   add_to_segment_broadcast → tag the customer with a segment marker the
//                            existing broadcast/segment targeting consumes
//                            (we never enqueue a broadcast directly)
//
// ANTI-SPAM (hard):
//   • Per-rule, per-customer throttle (rule.throttleSeconds).
//   • Global per-customer action cap across ALL rules in a rolling 24h window
//     (GLOBAL_CUSTOMER_DAILY_CAP). Every attempt is logged to
//     AutomationActionLog (fired | throttled | capped | skipped | failed).
//
// Defensive throughout: every DB call is guarded; the engine never throws into
// its caller (it lives in fire-and-forget tails).

import { prisma } from "@/lib/db";
import { queueSmartFollowUp } from "@/lib/follow-ups";
import { notifyAdmin } from "@/lib/notify";

export const AUTOMATION_TRIGGERS = [
  "score_crossed",
  "stage_changed",
  "idle_hours",
  "order_status_changed",
  "cart_abandoned",
] as const;

export const AUTOMATION_ACTIONS = [
  "queue_follow_up",
  "tag_customer",
  "notify_admin",
  "add_to_segment_broadcast",
] as const;

export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];
export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number];

// Numeric customer metrics a score_crossed rule may threshold on.
export const SCORE_METRICS = [
  "leadScore",
  "conversionScore",
  "hesitationScore",
  "churnRiskScore",
  "loyaltyScore",
  "retentionScore",
  "purchaseProb",
  "frustrationScore",
] as const;
export type ScoreMetric = (typeof SCORE_METRICS)[number];

const GLOBAL_CUSTOMER_DAILY_CAP = 3; // max automation actions per customer / 24h
const HOUR = 60 * 60 * 1000;

export type AutomationEvent =
  | { type: "message_classified"; customerId: string; conversationId?: string | null }
  | { type: "stage_changed"; customerId: string; conversationId?: string | null; fromStage?: string | null; toStage: string }
  | { type: "order_status_changed"; customerId: string; conversationId?: string | null; status: string }
  | { type: "cart_abandoned"; customerId: string; conversationId?: string | null }
  | { type: "idle"; customerId: string; conversationId?: string | null; idleHours: number };

const EVENT_TO_TRIGGER: Record<AutomationEvent["type"], AutomationTrigger> = {
  message_classified: "score_crossed",
  stage_changed: "stage_changed",
  order_status_changed: "order_status_changed",
  cart_abandoned: "cart_abandoned",
  idle: "idle_hours",
};

function parseJson(raw: unknown): any {
  try {
    return JSON.parse(String(raw || "{}")) || {};
  } catch {
    return {};
  }
}

function cmp(actual: number, op: string, expected: number): boolean {
  switch (op) {
    case ">":
      return actual > expected;
    case ">=":
      return actual >= expected;
    case "<":
      return actual < expected;
    case "<=":
      return actual <= expected;
    case "==":
      return actual === expected;
    case "!=":
      return actual !== expected;
    default:
      return false;
  }
}

/** Does this rule's conditions match the event + customer snapshot? */
function conditionsMatch(rule: any, event: AutomationEvent, customer: any): boolean {
  const cond = parseJson(rule.conditions);
  switch (rule.triggerType as AutomationTrigger) {
    case "score_crossed": {
      const metric = String(cond.metric || "");
      if (!SCORE_METRICS.includes(metric as ScoreMetric)) return false;
      const actual = Number(customer?.[metric] ?? 0);
      const value = Number(cond.value ?? 0);
      const op = String(cond.op || ">=");
      return cmp(actual, op, value);
    }
    case "stage_changed": {
      if (event.type !== "stage_changed") return false;
      if (cond.fromStage && cond.fromStage !== event.fromStage) return false;
      if (cond.toStage && cond.toStage !== event.toStage) return false;
      return true;
    }
    case "order_status_changed": {
      if (event.type !== "order_status_changed") return false;
      if (cond.status && cond.status !== event.status) return false;
      return true;
    }
    case "cart_abandoned": {
      return event.type === "cart_abandoned";
    }
    case "idle_hours": {
      if (event.type !== "idle") return false;
      const minHours = Number(cond.hours ?? 0);
      return event.idleHours >= minHours;
    }
    default:
      return false;
  }
}

/** Per-rule per-customer throttle: has this rule fired for this customer too recently? */
async function isThrottled(rule: any, customerId: string, now: Date): Promise<boolean> {
  const throttleMs = Math.max(0, (rule.throttleSeconds || 0) * 1000);
  if (throttleMs === 0) return false;
  const since = new Date(now.getTime() - throttleMs);
  const recent = await (prisma as any).automationActionLog
    .findFirst({
      where: { ruleId: rule.id, customerId, status: "fired", firedAt: { gte: since } },
      select: { id: true },
    })
    .catch(() => null);
  return !!recent;
}

/** Global per-customer cap across ALL rules in a rolling 24h window. */
async function isCustomerCapped(userId: string, customerId: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - 24 * HOUR);
  const count = await (prisma as any).automationActionLog
    .count({ where: { userId, customerId, status: "fired", firedAt: { gte: since } } })
    .catch(() => 0);
  return count >= GLOBAL_CUSTOMER_DAILY_CAP;
}

async function logAction(args: {
  userId: string;
  ruleId: string;
  customerId: string | null;
  actionType: string;
  status: string;
  detail?: string;
}): Promise<void> {
  await (prisma as any).automationActionLog
    .create({
      data: {
        userId: args.userId,
        ruleId: args.ruleId,
        customerId: args.customerId,
        actionType: args.actionType,
        status: args.status,
        detail: args.detail ? args.detail.slice(0, 480) : null,
      },
    })
    .catch(() => {});
}

/** Execute one rule's action through the appropriate SAFE path. Returns a
 *  status string; never throws. */
async function executeAction(
  rule: any,
  event: AutomationEvent,
  customer: any,
): Promise<{ status: string; detail?: string }> {
  const cfg = parseJson(rule.actionConfig);
  switch (rule.actionType as AutomationAction) {
    case "queue_follow_up": {
      const hint = String(cfg.message || cfg.messageText || "").trim();
      const delayHours = Math.max(1, Math.min(168, Number(cfg.delayHours ?? 1)));
      const seed =
        hint ||
        "حبينا نطمن عليك ونشوف لو محتاج أي مساعدة تخص آخر استفسارك. إحنا جاهزين.";
      const r = await queueSmartFollowUp({
        userId: rule.userId,
        customerId: customer.id,
        conversationId: (event as any).conversationId || null,
        messageText: seed,
        delayHours,
        reason: `automation:${rule.id}`,
      }).catch(() => ({ queued: false, reason: "queue_error" }) as any);
      return r.queued
        ? { status: "fired", detail: "queued_follow_up" }
        : { status: "skipped", detail: r.reason || "not_queued" };
    }
    case "tag_customer": {
      const tag = String(cfg.tag || "").trim().slice(0, 40);
      if (!tag) return { status: "skipped", detail: "no_tag" };
      const existing = parseTags(customer.tags);
      if (existing.includes(tag)) return { status: "skipped", detail: "tag_exists" };
      const merged = Array.from(new Set([...existing, tag])).slice(0, 12);
      await (prisma as any).customer
        .update({ where: { id: customer.id }, data: { tags: JSON.stringify(merged) } })
        .catch(() => {});
      return { status: "fired", detail: `tag:${tag}` };
    }
    case "notify_admin": {
      const toPhone =
        String(cfg.toPhone || "").trim() ||
        (await resolveBotNotifyPhone(rule.userId));
      if (!toPhone) return { status: "skipped", detail: "no_notify_phone" };
      const label = customer.name || customer.phone || customer.id;
      const text =
        String(cfg.message || "").trim() ||
        `🔔 قاعدة أتمتة "${rule.name}" تحققت للعميل: ${label}.`;
      const r = await notifyAdmin({
        userId: rule.userId,
        toPhone,
        text,
        category: "automation",
      }).catch(() => ({ ok: false }) as any);
      return r.ok ? { status: "fired", detail: "notified_admin" } : { status: "failed", detail: "notify_failed" };
    }
    case "add_to_segment_broadcast": {
      // Safe additive path: tag the customer with a segment marker the existing
      // broadcast/segment targeting can filter on. We NEVER enqueue a broadcast
      // directly from automation (that pipeline is protected + opt-in).
      const segment = String(cfg.segment || "").trim().slice(0, 40);
      if (!segment) return { status: "skipped", detail: "no_segment" };
      const marker = `segment:${segment}`;
      const existing = parseTags(customer.tags);
      if (existing.includes(marker)) return { status: "skipped", detail: "segment_exists" };
      const merged = Array.from(new Set([...existing, marker])).slice(0, 12);
      await (prisma as any).customer
        .update({ where: { id: customer.id }, data: { tags: JSON.stringify(merged) } })
        .catch(() => {});
      return { status: "fired", detail: `segment:${segment}` };
    }
    default:
      return { status: "skipped", detail: "unknown_action" };
  }
}

function parseTags(raw: unknown): string[] {
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    return Array.isArray(parsed) ? parsed.map((t) => String(t)) : [];
  } catch {
    return [];
  }
}

async function resolveBotNotifyPhone(userId: string): Promise<string> {
  const bot = await (prisma as any).bot
    .findUnique({ where: { userId }, select: { notifyPhone: true, whatsappPhone: true } })
    .catch(() => null);
  return String(bot?.notifyPhone || bot?.whatsappPhone || "").trim();
}

/**
 * Main entry point. Evaluate all enabled rules for the merchant that match this
 * event, applying throttle + global cap, and execute matching actions. Bounded,
 * defensive, never throws. Safe to call fire-and-forget from background tails.
 */
export async function evaluateAutomations(args: {
  userId: string;
  event: AutomationEvent;
  now?: Date;
}): Promise<{ matched: number; fired: number }> {
  const now = args.now || new Date();
  const triggerType = EVENT_TO_TRIGGER[args.event.type];
  let matched = 0;
  let fired = 0;

  try {
    const rules = await (prisma as any).automationRule
      .findMany({
        where: { userId: args.userId, enabled: true, triggerType },
        take: 50,
      })
      .catch(() => []);
    if (!rules.length) return { matched, fired };

    const customer = await (prisma as any).customer
      .findUnique({ where: { id: args.event.customerId } })
      .catch(() => null);
    if (!customer) return { matched, fired };
    if (customer.optedOutAt) return { matched, fired }; // honor opt-out for any send-ish action

    for (const rule of rules as any[]) {
      if (!conditionsMatch(rule, args.event, customer)) continue;
      matched++;

      if (await isThrottled(rule, customer.id, now)) {
        await logAction({ userId: args.userId, ruleId: rule.id, customerId: customer.id, actionType: rule.actionType, status: "throttled" });
        continue;
      }
      if (await isCustomerCapped(args.userId, customer.id, now)) {
        await logAction({ userId: args.userId, ruleId: rule.id, customerId: customer.id, actionType: rule.actionType, status: "capped" });
        continue;
      }

      const res = await executeAction(rule, args.event, customer);
      await logAction({
        userId: args.userId,
        ruleId: rule.id,
        customerId: customer.id,
        actionType: rule.actionType,
        status: res.status,
        detail: res.detail,
      });
      if (res.status === "fired") {
        fired++;
        await (prisma as any).automationRule
          .update({ where: { id: rule.id }, data: { lastFiredAt: now, fireCount: { increment: 1 } } })
          .catch(() => {});
      }
    }
  } catch {
    // never throw into a background caller
  }

  return { matched, fired };
}

/**
 * Time-based runner for idle_hours rules. Called by the automations cron.
 * For every merchant with an enabled idle_hours rule, finds customers idle
 * beyond the smallest configured threshold and evaluates. Bounded + defensive.
 */
export async function runIdleAutomations(opts: {
  now?: Date;
  userId?: string;
  maxMerchants?: number;
  maxPerMerchant?: number;
} = {}): Promise<{ merchants: number; customers: number; fired: number }> {
  const now = opts.now || new Date();
  const maxMerchants = Math.max(1, Math.min(500, opts.maxMerchants || 200));
  const maxPerMerchant = Math.max(1, Math.min(500, opts.maxPerMerchant || 100));
  let merchants = 0;
  let customers = 0;
  let fired = 0;

  try {
    const rules = await (prisma as any).automationRule
      .findMany({
        where: {
          enabled: true,
          triggerType: "idle_hours",
          ...(opts.userId ? { userId: opts.userId } : {}),
        },
        take: 2000,
      })
      .catch(() => []);
    if (!rules.length) return { merchants, customers, fired };

    // Group rules per merchant; track the smallest idle threshold to bound the
    // candidate query.
    const byUser = new Map<string, any[]>();
    for (const r of rules as any[]) {
      if (!byUser.has(r.userId)) byUser.set(r.userId, []);
      byUser.get(r.userId)!.push(r);
    }

    let merchantCount = 0;
    for (const [userId, userRules] of byUser.entries()) {
      if (merchantCount >= maxMerchants) break;
      merchantCount++;
      merchants++;

      let minHours = Infinity;
      for (const r of userRules) {
        const h = Number(parseJson(r.conditions).hours ?? 0);
        if (h > 0 && h < minHours) minHours = h;
      }
      if (!Number.isFinite(minHours)) continue;

      const idleBefore = new Date(now.getTime() - minHours * HOUR);
      const candidates = await (prisma as any).customer
        .findMany({
          where: {
            userId,
            optedOutAt: null,
            lastInboundAt: { lte: idleBefore, not: null },
          },
          orderBy: { lastInboundAt: "asc" },
          take: maxPerMerchant,
          select: { id: true, lastInboundAt: true },
        })
        .catch(() => []);

      for (const cand of candidates as any[]) {
        customers++;
        const idleHours = cand.lastInboundAt
          ? Math.floor((now.getTime() - new Date(cand.lastInboundAt).getTime()) / HOUR)
          : 0;
        const res = await evaluateAutomations({
          userId,
          event: { type: "idle", customerId: cand.id, idleHours },
          now,
        });
        fired += res.fired;
      }
    }
  } catch {
    // never throw
  }

  return { merchants, customers, fired };
}
