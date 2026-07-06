/**
 * lib/wallet/meta-cost.ts — Meta Cost Engine (append-only reconciler).
 *
 * Derives billable Meta (WhatsApp Cloud) conversations from the EXISTING,
 * append-only WaMessage outbound ledger and (optionally) debits the tenant
 * wallet. It NEVER touches the send pipeline — it only reads already-persisted
 * WaMessage rows and writes new MetaUsageRecord / WalletLedger rows.
 *
 * Conversation model (estimate-grade, deterministic, idempotent):
 *   - One billable conversation per (tenant, customerPhone, category, UTC day).
 *   - Category per day = the highest-cost category among that day's sent
 *     outbound messages: template sends use the template's category (marketing /
 *     authentication / utility); non-template free-form = "service".
 *   - Cost is taken from the admin rate card (lib/wallet/meta-rates), priced by
 *     the recipient's country (best-effort from the phone prefix).
 *
 * This approximates Meta's rolling-24h window with a per-UTC-day bucket so the
 * result is stable under re-runs and safe to upsert. Costs are labeled as
 * estimates in the UI, consistent with /admin/tenant-costs.
 */

import { prisma } from "@/lib/db";
import { roundUsd } from "./money";
import { countryFromPhone, loadRateCard, type MetaCategory } from "./meta-rates";
import { debit } from "./wallet";
import { walletFlags } from "./flags";

/** Category cost rank — higher wins when a day mixes categories. */
const RANK: Record<MetaCategory, number> = { marketing: 3, authentication: 2, utility: 1, service: 0 };

const BILLABLE_STATUSES = new Set(["sent", "delivered", "read"]);

interface WaRow {
  userId: string;
  customerPhone: string;
  kind: string | null;
  templateName: string | null;
  status: string;
  sentAt: Date | null;
  queuedAt: Date;
}

function utcDay(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

/** Map a WaTemplate.category value → our billing category. */
function mapTemplateCategory(raw: string | null | undefined): MetaCategory {
  switch (String(raw || "").toUpperCase()) {
    case "MARKETING": return "marketing";
    case "AUTHENTICATION": return "authentication";
    case "UTILITY": return "utility";
    default: return "utility"; // unknown / unsynced template → conservative default
  }
}

export interface MetaCostRunOptions {
  /** Trailing days of WaMessage history to reconcile. Default 3. */
  lookbackDays?: number;
  /** Limit to one tenant (admin recompute). Default: all tenants. */
  userId?: string;
  /** Hard cap on rows scanned per run (safety bound). Default 50_000. */
  maxRows?: number;
  /** Override the global billing flag (e.g. force shadow). */
  debitWallet?: boolean;
}

export interface MetaCostRunResult {
  scannedRows: number;
  capped: boolean;
  conversations: number;
  recorded: number;
  updated: number;
  billedCount: number;
  billedUsd: number;
  insufficientCount: number;
  shadow: boolean;
  costUsd: number;
  metaCostUsd: number;
}

/**
 * Run the reconciler. Always RECORDS conversations (idempotent upsert). Debits
 * wallets only when billing is enabled (flag or explicit option). Safe to run
 * repeatedly — re-runs converge.
 */
export async function runMetaCostReconciler(opts: MetaCostRunOptions = {}): Promise<MetaCostRunResult> {
  const lookbackDays = Math.min(Math.max(opts.lookbackDays ?? 3, 1), 60);
  const maxRows = Math.min(Math.max(opts.maxRows ?? 50_000, 100), 200_000);
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const doDebit = opts.debitWallet ?? walletFlags.billingEnabled;

  const where: any = {
    provider: "meta_cloud",
    direction: "outbound",
    status: { in: Array.from(BILLABLE_STATUSES) },
    OR: [{ sentAt: { gte: since } }, { sentAt: null, queuedAt: { gte: since } }],
  };
  if (opts.userId) where.userId = opts.userId;

  const rows = (await prisma.waMessage.findMany({
    where,
    select: { userId: true, customerPhone: true, kind: true, templateName: true, status: true, sentAt: true, queuedAt: true },
    orderBy: { queuedAt: "asc" },
    take: maxRows + 1,
  }).catch(() => [])) as unknown as WaRow[];

  const capped = rows.length > maxRows;
  const scanned = capped ? rows.slice(0, maxRows) : rows;

  // Resolve template NAME → category via the WaTemplate table. WaMessage stores
  // the template's name (e.g. "promo"), not its Meta category, so we must join.
  const tplKeys = new Set<string>();
  for (const r of scanned) {
    if (r.kind === "template" && r.templateName) tplKeys.add(`${r.userId}::${r.templateName.toLowerCase()}`);
  }
  const tplCategory = new Map<string, MetaCategory>();
  if (tplKeys.size > 0) {
    const userIds = Array.from(new Set(scanned.filter((r) => r.kind === "template").map((r) => r.userId)));
    const tpls = await prisma.waTemplate.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, name: true, category: true },
    }).catch(() => []);
    for (const t of tpls) tplCategory.set(`${t.userId}::${String(t.name).toLowerCase()}`, mapTemplateCategory(t.category));
  }

  // Bucket: key = userId | phone | day. Aggregate count + winning category + window.
  interface Bucket {
    userId: string; phone: string; day: string;
    count: number; cat: MetaCategory; first: Date; last: Date;
  }
  const buckets = new Map<string, Bucket>();
  for (const r of scanned) {
    const when = r.sentAt || r.queuedAt;
    const day = utcDay(when);
    const cat: MetaCategory = r.kind === "template"
      ? (tplCategory.get(`${r.userId}::${String(r.templateName || "").toLowerCase()}`) ?? "utility")
      : "service";
    const key = `${r.userId}|${r.customerPhone}|${day}`;
    const b = buckets.get(key);
    if (!b) {
      buckets.set(key, { userId: r.userId, phone: r.customerPhone, day, count: 1, cat, first: when, last: when });
    } else {
      b.count += 1;
      if (RANK[cat] > RANK[b.cat]) b.cat = cat;
      if (when < b.first) b.first = when;
      if (when > b.last) b.last = when;
    }
  }

  const rateResolver = await loadRateCard();
  const result: MetaCostRunResult = {
    scannedRows: scanned.length, capped, conversations: buckets.size,
    recorded: 0, updated: 0, billedCount: 0, billedUsd: 0, insufficientCount: 0,
    shadow: !doDebit, costUsd: 0, metaCostUsd: 0,
  };

  for (const b of buckets.values()) {
    const country = countryFromPhone(b.phone);
    const rate = rateResolver(country, b.cat);
    const conversationKey = `${b.phone}:${b.cat}:${b.day}`;
    const windowStart = new Date(`${b.day}T00:00:00.000Z`);
    const windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);

    // Idempotent upsert. If the record exists AND is already billed, lock the
    // priced fields (never re-price a charged conversation); only refresh counts.
    const existing = await prisma.metaUsageRecord.findUnique({
      where: { userId_conversationKey: { userId: b.userId, conversationKey } },
    }).catch(() => null);

    let recordId: string;
    let costUsd: number;
    if (!existing) {
      const created = await prisma.metaUsageRecord.create({
        data: {
          userId: b.userId, customerPhone: b.phone, category: b.cat, country,
          conversationKey, windowStart, windowEnd, messageCount: b.count,
          rateUsd: rate.rateUsd, metaCostUsd: rate.metaCostUsd, costUsd: rate.rateUsd,
          unitCostUsd: rate.rateUsd, conversationType: b.cat,
          billed: false,
        },
      });
      recordId = created.id;
      costUsd = rate.rateUsd;
      result.recorded += 1;
    } else {
      const locked = existing.billed;
      const updated = await prisma.metaUsageRecord.update({
        where: { id: existing.id },
        data: locked
          ? { messageCount: b.count }
          : { messageCount: b.count, category: b.cat, country, rateUsd: rate.rateUsd, metaCostUsd: rate.metaCostUsd, costUsd: rate.rateUsd, unitCostUsd: rate.rateUsd, conversationType: b.cat },
      });
      recordId = updated.id;
      costUsd = updated.costUsd;
      result.updated += 1;
    }

    result.costUsd = roundUsd(result.costUsd + (existing?.costUsd ?? costUsd));
    result.metaCostUsd = roundUsd(result.metaCostUsd + (existing?.metaCostUsd ?? rate.metaCostUsd));

    // Debit the wallet for unbilled conversations (idempotent per record).
    if (doDebit) {
      const rec = existing && existing.billed ? null : { id: recordId, cost: costUsd };
      if (rec && rec.cost > 0) {
        const res = await debit({
          userId: b.userId,
          kind: "meta_usage",
          amountUsd: rec.cost,
          source: "meta_cost",
          reason: `meta:${b.cat}:${country || "*"}`,
          idempotencyKey: `meta:${rec.id}`,
          metadata: { conversationKey, category: b.cat, country, day: b.day },
        });
        if (res.ok && res.recorded) {
          await prisma.metaUsageRecord.update({ where: { id: rec.id }, data: { billed: true, walletLedgerId: res.ledgerId } });
          result.billedCount += 1;
          result.billedUsd = roundUsd(result.billedUsd + rec.cost);
        } else if (res.replay) {
          // Already billed in a prior run — ensure the flag is set.
          await prisma.metaUsageRecord.update({ where: { id: rec.id }, data: { billed: true, walletLedgerId: res.ledgerId } }).catch(() => {});
        } else if (res.reason === "insufficient_funds") {
          result.insufficientCount += 1;
        }
      } else if (rec && rec.cost === 0) {
        // Free category (e.g. service) — mark billed so it isn't retried.
        await prisma.metaUsageRecord.update({ where: { id: rec.id }, data: { billed: true } }).catch(() => {});
      }
    }
  }

  return result;
}

/**
 * Retry billing for unbilled conversations of a tenant (e.g. right after a
 * top-up). Reads existing MetaUsageRecord rows; does not re-scan WaMessage.
 */
export async function billUnbilledForUser(userId: string): Promise<{ billedCount: number; billedUsd: number; insufficientCount: number }> {
  const out = { billedCount: 0, billedUsd: 0, insufficientCount: 0 };
  if (!walletFlags.billingEnabled) return out;
  const pending = await prisma.metaUsageRecord.findMany({
    where: { userId, billed: false, costUsd: { gt: 0 } },
    orderBy: { windowStart: "asc" },
    take: 1000,
  }).catch(() => []);
  for (const rec of pending) {
    const res = await debit({
      userId, kind: "meta_usage", amountUsd: rec.costUsd, source: "meta_cost",
      reason: `meta:${rec.category}:${rec.country || "*"}`, idempotencyKey: `meta:${rec.id}`,
      metadata: { conversationKey: rec.conversationKey },
    });
    if (res.ok && (res.recorded || res.replay)) {
      await prisma.metaUsageRecord.update({ where: { id: rec.id }, data: { billed: true, walletLedgerId: res.ledgerId } });
      if (res.recorded) { out.billedCount += 1; out.billedUsd = roundUsd(out.billedUsd + rec.costUsd); }
    } else if (res.reason === "insufficient_funds") {
      out.insufficientCount += 1;
      break; // stop at first shortfall — nothing more will succeed this pass
    }
  }
  return out;
}
