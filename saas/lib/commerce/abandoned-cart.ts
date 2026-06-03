// Abandoned-cart recovery engine (Agent 3, Task #7).
//
// The Customer.cartItems / cartUpdatedAt / cartReminderSent columns have existed
// since Wave 8 but NOTHING fired off them. This engine closes that loop:
//
//   • A cron (app/api/cron/abandoned-cart/route.ts) calls runAbandonedCartSweep().
//   • For each merchant with bot.abandonedCartEnabled === true (OFF by default)
//     and an active subscription, we find customers whose cart went stale:
//        - cartUpdatedAt within [now-windowHours, now-delayHours]
//        - cartReminderSent === false
//        - not opted out
//        - no order placed since the cart was updated (i.e. didn't convert)
//   • For each, we queue EXACTLY ONE recovery follow-up through the PROTECTED
//     queueSmartFollowUp path (kind inferred as product_view via messageText),
//     then set cartReminderSent = true so it never repeats. Fully idempotent.
//
// HARD RULES honored (CLAUDE.md + AGENT3_PROMPT):
//   - We NEVER send directly. queueSmartFollowUp → FollowUpTask → existing
//     cron/queue → wa.send. We only add a trigger + scheduling.
//   - Opt-out, subscription, follow-up caps, pacing all enforced downstream.
//   - Opt-in by default, OFF by default (bot.abandonedCartEnabled).
//   - Prioritized by Agent 1's value-tier when order facts are available.
//
// recordCartInterest() is the additive write-side helper that populates the
// cart signal from product-interest moments (used by the background classify
// tail and any future commerce "abandoned checkout" webhook). It is cheap,
// never throws, and resets cartReminderSent so a fresh cart can be recovered.

import { prisma } from "@/lib/db";
import { queueSmartFollowUp } from "@/lib/follow-ups";
import { classifyValueTier, valueTierRank } from "@/lib/intelligence/value-tier";
import { evaluateAutomations } from "@/lib/automations/engine";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export interface AbandonedCartSweepResult {
  merchantsExamined: number;
  merchantsEnabled: number;
  customersExamined: number;
  queued: number;
  skipped: number;
  log: Array<{
    userId: string;
    customerId: string;
    status: "queued" | "skipped";
    reason?: string;
  }>;
}

interface CartItemLite {
  name?: string;
  title?: string;
  qty?: number;
  quantity?: number;
}

function parseCartItems(raw: unknown): CartItemLite[] {
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

function cartItemNames(items: CartItemLite[]): string[] {
  return items
    .map((it) => String(it?.name || it?.title || "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

/**
 * Record / refresh a customer's cart-interest signal. Additive, idempotent,
 * never throws. Setting cartReminderSent=false lets a fresh cart be recovered
 * even if a previous one was already reminded.
 *
 * `items` may be product names or {name|title, qty} objects — we store a
 * compact JSON list. Capped to avoid unbounded growth.
 */
export async function recordCartInterest(args: {
  customerId: string;
  items: Array<string | CartItemLite>;
  now?: Date;
}): Promise<void> {
  try {
    const normalized = (args.items || [])
      .map((it) =>
        typeof it === "string"
          ? { name: it.trim() }
          : { name: String(it?.name || it?.title || "").trim(), qty: it?.qty || it?.quantity || 1 },
      )
      .filter((it) => it.name)
      .slice(0, 20);
    if (normalized.length === 0) return;

    await (prisma as any).customer.update({
      where: { id: args.customerId },
      data: {
        cartItems: JSON.stringify(normalized),
        cartUpdatedAt: args.now || new Date(),
        cartReminderSent: false,
      },
    });
  } catch {
    // best-effort signal — never block or throw on the hot path
  }
}

/** Build the soft, non-pushy Arabic recovery message seed. The real text is
 *  produced downstream by queueSmartFollowUp's rule/LLM layer; this seed sets
 *  the inferred kind (product_view) and gives context. */
function buildCartMessageSeed(itemNames: string[]): string {
  if (itemNames.length === 0) {
    return "لسه مهتم بالمنتج اللي كنت بتسأل عنه؟ أقدر أساعدك تكمل طلبك بسهولة.";
  }
  const head = itemNames.slice(0, 2).join(" و");
  return `لسه مهتم بـ${head}؟ المنتج لسه متاح، وأقدر أساعدك تكمل طلبك في خطوة واحدة.`;
}

/**
 * Core sweep. Bounded, idempotent, flag-gated. Safe to run repeatedly.
 * Pass `userId` to scope to one merchant (used by tests / targeted runs).
 */
export async function runAbandonedCartSweep(opts: {
  now?: Date;
  userId?: string;
  maxMerchants?: number;
  maxPerMerchant?: number;
} = {}): Promise<AbandonedCartSweepResult> {
  const now = opts.now || new Date();
  const maxMerchants = Math.max(1, Math.min(500, opts.maxMerchants || 200));
  const maxPerMerchant = Math.max(1, Math.min(200, opts.maxPerMerchant || 50));

  const result: AbandonedCartSweepResult = {
    merchantsExamined: 0,
    merchantsEnabled: 0,
    customersExamined: 0,
    queued: 0,
    skipped: 0,
    log: [],
  };

  // Only merchants who explicitly enabled the engine. OFF by default.
  const bots = await (prisma as any).bot
    .findMany({
      where: {
        abandonedCartEnabled: true,
        ...(opts.userId ? { userId: opts.userId } : {}),
      },
      select: {
        userId: true,
        abandonedCartDelayHours: true,
        abandonedCartWindowHours: true,
      },
      take: maxMerchants,
    })
    .catch(() => []);

  result.merchantsExamined = bots.length;

  for (const bot of bots as any[]) {
    // Verify subscription is active before touching any customer.
    const sub = await (prisma as any).subscription
      .findUnique({ where: { userId: bot.userId }, select: { status: true, expiresAt: true } })
      .catch(() => null);
    if (!sub || sub.status !== "active" || new Date(sub.expiresAt) < now) {
      continue;
    }
    result.merchantsEnabled++;

    const delayHours = Math.max(1, Math.min(168, bot.abandonedCartDelayHours || 4));
    const windowHours = Math.max(delayHours, Math.min(720, bot.abandonedCartWindowHours || 24));
    const olderThan = new Date(now.getTime() - delayHours * HOUR); // cart must be at least this stale
    const newerThan = new Date(now.getTime() - windowHours * HOUR); // but not ancient

    const candidates = await (prisma as any).customer
      .findMany({
        where: {
          userId: bot.userId,
          cartReminderSent: false,
          optedOutAt: null,
          cartUpdatedAt: { lte: olderThan, gte: newerThan },
        },
        orderBy: { cartUpdatedAt: "asc" },
        take: maxPerMerchant * 3, // over-fetch; we filter converted + rank below
        select: {
          id: true,
          name: true,
          phone: true,
          cartItems: true,
          cartUpdatedAt: true,
          leadScore: true,
          orderCount: true,
          totalOrderValue: true,
          lastOrderAt: true,
        },
      })
      .catch(() => []);

    // Rank by value tier (Agent 1's classification) then lead score, so the
    // highest-value stale carts are recovered first under the per-merchant cap.
    const ranked = (candidates as any[])
      .map((c) => {
        const daysSinceLastOrder = c.lastOrderAt
          ? Math.floor((now.getTime() - new Date(c.lastOrderAt).getTime()) / DAY)
          : null;
        const tier = classifyValueTier({
          revenue: c.totalOrderValue || 0,
          orderCount: c.orderCount || 0,
          daysSinceLastOrder,
          leadScore: c.leadScore || 0,
        });
        return { c, rank: valueTierRank(tier) * 1000 + (c.leadScore || 0) };
      })
      .sort((a, b) => b.rank - a.rank);

    let queuedForMerchant = 0;
    for (const { c } of ranked) {
      if (queuedForMerchant >= maxPerMerchant) break;
      result.customersExamined++;

      // Did the customer convert AFTER the cart was updated? If a non-canceled
      // order exists since cartUpdatedAt, mark reminded (no-op) and skip.
      const convertedSince = await (prisma as any).order
        .findFirst({
          where: {
            customerId: c.id,
            status: { not: "canceled" },
            createdAt: { gte: c.cartUpdatedAt },
          },
          select: { id: true },
        })
        .catch(() => null);

      if (convertedSince) {
        await (prisma as any).customer
          .update({ where: { id: c.id }, data: { cartReminderSent: true } })
          .catch(() => {});
        result.skipped++;
        result.log.push({ userId: bot.userId, customerId: c.id, status: "skipped", reason: "converted" });
        continue;
      }

      const names = cartItemNames(parseCartItems(c.cartItems));
      const conv = await prisma.conversation
        .findUnique({ where: { customerId: c.id }, select: { id: true } })
        .catch(() => null);

      const queued = await queueSmartFollowUp({
        userId: bot.userId,
        customerId: c.id,
        conversationId: conv?.id || null,
        messageText: buildCartMessageSeed(names),
        intent: "inquiry",
        delayHours: 1, // due now-ish; pacing + caps applied by the queue/cron
        reason: "abandoned_cart",
      }).catch(() => ({ queued: false, reason: "queue_error" }) as any);

      // Always mark reminded once we've attempted, so the sweep is idempotent
      // and a single stale cart never generates more than one recovery attempt.
      await (prisma as any).customer
        .update({ where: { id: c.id }, data: { cartReminderSent: true } })
        .catch(() => {});

      if (queued.queued) {
        queuedForMerchant++;
        result.queued++;
        result.log.push({ userId: bot.userId, customerId: c.id, status: "queued" });
      } else {
        result.skipped++;
        result.log.push({
          userId: bot.userId,
          customerId: c.id,
          status: "skipped",
          reason: queued.reason || "not_queued",
        });
      }

      // Let merchant-authored automations also react to this cart_abandoned
      // event (e.g. tag / notify). queueSmartFollowUp's per-customer dedupe and
      // the engine's global cap prevent any double-send vs the built-in recovery.
      evaluateAutomations({
        userId: bot.userId,
        event: { type: "cart_abandoned", customerId: c.id, conversationId: conv?.id || null },
        now,
      }).catch(() => {});
    }
  }

  return result;
}
