// AI Intelligence Layer — Memory Graph (Agent 1 — Task 3).
//
// THE GAP THIS CLOSES (see audit #3): the memory extractor (lib/memory.ts)
// already identifies each customer's products + objections and writes them into
// CustomerMemory.factsJson — but those facts are siloed per-customer. There is no
// cross-customer view of which objections precede LOST deals vs WON ones, which
// is exactly the signal a merchant needs to fix their playbook.
//
// This module is a SIBLING of the rolling-summary extractor: it runs in the same
// background cycle, reads the facts the extractor just produced, and writes
// append-only edges to the new MemoryEdge table. It NEVER touches
// CustomerMemory's write path, the send pipeline, billing, or the hot reply path.
//
// Edges captured (per merchant, per customer):
//   • (objection:<key>) --preceded_outcome--> (outcome:<won|lost>)
//   • (customer:<id>)   --interested_in-->     (product:<name>)
//
// The one concrete merchant query — getObjectionOutcomeInsights — answers:
// "which objection most precedes lost vs won outcomes for this merchant?"
// It REPLACES the earlier empty stub while keeping the same { insights } shape
// the Sales Brain route already consumes. Everything here is .catch()-guarded
// and fail-closed.

import { prisma } from "@/lib/db";
import { intelFlag } from "./flags";
import type { MemoryFacts } from "@/lib/memory";

const DAY = 24 * 60 * 60 * 1000;

// Objections we track as graph subjects. Mirrors the extractor's objection set
// (lib/memory.ts) plus the few synonyms the LLM sometimes emits.
const KNOWN_OBJECTIONS = new Set([
  "price",
  "shipping",
  "quality",
  "trust",
  "delivery",
  "warranty",
  "size",
]);

const OBJECTION_LABEL: Record<string, string> = {
  price: "السعر",
  shipping: "الشحن",
  delivery: "التوصيل",
  quality: "الجودة",
  trust: "الثقة",
  warranty: "الضمان",
  size: "المقاس",
};

export function objectionLabel(key: string): string {
  return OBJECTION_LABEL[key] || key;
}

export type EdgeOutcome = "won" | "lost" | "open";

// ---------------------------------------------------------------------------
// Outcome derivation — pure heuristic over facts the system already maintains.
// "won"  = the customer has at least one non-canceled order.
// "lost" = no order, was buyer-ish (had objections / lead signal), and has gone
//          silent for ≥ LOST_SILENCE_DAYS (mirrors the lost-customer detector).
// "open" = still in play — we do NOT write outcome edges for these yet.
// ---------------------------------------------------------------------------
const LOST_SILENCE_DAYS = 7;

export function deriveOutcome(args: {
  orderCount: number;
  daysSinceLastInbound: number;
  hadObjectionOrLead: boolean;
}): EdgeOutcome {
  if (args.orderCount > 0) return "won";
  if (args.hadObjectionOrLead && args.daysSinceLastInbound >= LOST_SILENCE_DAYS)
    return "lost";
  return "open";
}

// ---------------------------------------------------------------------------
// Sibling extractor — called from triggerMemoryUpdate's background tail right
// after the rolling summary is written. Bounded, read-then-upsert, fail-closed.
// ---------------------------------------------------------------------------
export async function extractMemoryEdges(args: {
  userId: string;
  customerId: string;
  facts: MemoryFacts;
  now?: Date;
}): Promise<{ written: number; outcome: EdgeOutcome } | null> {
  if (!intelFlag("INTEL_MEMORY_GRAPH")) return null;
  const now = args.now ?? new Date();

  try {
    const objections = Array.isArray(args.facts?.objections)
      ? args.facts.objections
          .map((o) => String(o || "").toLowerCase().trim())
          .filter((o) => KNOWN_OBJECTIONS.has(o))
      : [];
    const products = Array.isArray(args.facts?.products)
      ? args.facts.products
          .map((p) => String(p || "").trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];

    // Nothing graph-worthy in this customer's facts → skip cleanly.
    if (objections.length === 0 && products.length === 0) {
      return { written: 0, outcome: "open" };
    }

    // Pull the minimal outcome signal (order count + recency). Bounded.
    const [orderAgg, cust] = await Promise.all([
      prisma.order.aggregate({
        where: {
          userId: args.userId,
          customerId: args.customerId,
          status: { not: "canceled" },
        },
        _count: { _all: true },
      }),
      prisma.customer.findUnique({
        where: { id: args.customerId },
        select: { lastInboundAt: true, lastSeenAt: true, leadScore: true },
      }) as any,
    ]);
    const orderCount = orderAgg._count?._all || 0;
    const lastInbound = cust?.lastInboundAt || cust?.lastSeenAt || null;
    const daysSinceLastInbound = lastInbound
      ? Math.floor((now.getTime() - new Date(lastInbound).getTime()) / DAY)
      : 999;
    const hadObjectionOrLead =
      objections.length > 0 || (cust?.leadScore || 0) >= 40;

    const outcome = deriveOutcome({
      orderCount,
      daysSinceLastInbound,
      hadObjectionOrLead,
    });

    const edges: Array<{
      subjectType: string;
      subjectKey: string;
      relation: string;
      objectType: string;
      objectKey: string;
    }> = [];

    // objection --preceded_outcome--> outcome (only when the deal has resolved).
    if (outcome !== "open") {
      for (const obj of new Set(objections)) {
        edges.push({
          subjectType: "objection",
          subjectKey: obj,
          relation: "preceded_outcome",
          objectType: "outcome",
          objectKey: outcome,
        });
      }
    }

    // customer --interested_in--> product (useful for cross-sell, Agent 3).
    for (const prod of new Set(products)) {
      edges.push({
        subjectType: "customer",
        subjectKey: args.customerId,
        relation: "interested_in",
        objectType: "product",
        objectKey: prod.slice(0, 120),
      });
    }

    let written = 0;
    for (const e of edges) {
      const ok = await upsertEdge({
        userId: args.userId,
        customerId: args.customerId,
        ...e,
      });
      if (ok) written++;
    }

    return { written, outcome };
  } catch {
    return null; // never break the memory cycle
  }
}

async function upsertEdge(e: {
  userId: string;
  customerId: string;
  subjectType: string;
  subjectKey: string;
  relation: string;
  objectType: string;
  objectKey: string;
}): Promise<boolean> {
  const where = {
    userId_customerId_subjectType_subjectKey_relation_objectType_objectKey: {
      userId: e.userId,
      customerId: e.customerId,
      subjectType: e.subjectType,
      subjectKey: e.subjectKey,
      relation: e.relation,
      objectType: e.objectType,
      objectKey: e.objectKey,
    },
  };
  try {
    await (prisma as any).memoryEdge.upsert({
      where,
      create: { ...e, weight: 1 },
      update: { weight: { increment: 1 } },
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Merchant-facing insight query — objection ↔ outcome correlation.
//
// For each objection: how often did it precede a LOST outcome vs a WON one?
// Distinct customers are the unit (an objection raised by one customer across
// many edges still counts once toward that customer's outcome). Read-only.
//
// `MemoryGraphResult` keeps the exact { insights } shape the Sales Brain route
// already imports, so this is a drop-in replacement for the earlier stub.
// ---------------------------------------------------------------------------

export interface ObjectionOutcomeStat {
  objection: string; // normalized key
  objectionLabel: string; // Arabic
  lostCustomers: number; // distinct customers where this objection preceded a loss
  wonCustomers: number; // distinct customers where it preceded a win
  total: number;
  lostRate: number; // 0-1
}

export interface MemoryGraphResult {
  generatedAt: string;
  stats: ObjectionOutcomeStat[];
  // one or two ready-to-show Arabic insight lines for the dashboard
  insights: string[];
}

export async function getObjectionOutcomeInsights(
  userId: string,
  now: Date = new Date(),
): Promise<MemoryGraphResult> {
  const empty: MemoryGraphResult = {
    generatedAt: now.toISOString(),
    stats: [],
    insights: [],
  };
  if (!intelFlag("INTEL_MEMORY_GRAPH")) return empty;

  try {
    const rows: Array<{
      subjectKey: string;
      objectKey: string;
      customerId: string;
    }> = await (prisma as any).memoryEdge.findMany({
      where: {
        userId,
        subjectType: "objection",
        relation: "preceded_outcome",
        objectType: "outcome",
        objectKey: { in: ["won", "lost"] },
      },
      select: { subjectKey: true, objectKey: true, customerId: true },
      take: 20000,
    });

    if (!rows.length) return empty;

    // objection → { won: Set<customerId>, lost: Set<customerId> }
    const agg = new Map<string, { won: Set<string>; lost: Set<string> }>();
    for (const r of rows) {
      let m = agg.get(r.subjectKey);
      if (!m) {
        m = { won: new Set(), lost: new Set() };
        agg.set(r.subjectKey, m);
      }
      if (r.objectKey === "won") m.won.add(r.customerId);
      else if (r.objectKey === "lost") m.lost.add(r.customerId);
    }

    const stats: ObjectionOutcomeStat[] = Array.from(agg.entries())
      .map(([objection, m]) => {
        // A customer who eventually won shouldn't double-count as lost.
        for (const id of m.won) m.lost.delete(id);
        const lostCustomers = m.lost.size;
        const wonCustomers = m.won.size;
        const total = lostCustomers + wonCustomers;
        return {
          objection,
          objectionLabel: objectionLabel(objection),
          lostCustomers,
          wonCustomers,
          total,
          lostRate: total > 0 ? lostCustomers / total : 0,
        };
      })
      .filter((s) => s.total >= 1)
      .sort((a, b) => b.lostRate - a.lostRate || b.total - a.total);

    // Build a merchant-facing line only when there's enough signal to trust it.
    const insights: string[] = [];
    const headline = stats.find((s) => s.total >= 4 && s.lostRate >= 0.5);
    if (headline) {
      insights.push(
        `اعتراض ${headline.objectionLabel} يسبق ${Math.round(
          headline.lostRate * 100,
        )}% من الصفقات الضائعة — عالجه مبكراً في المحادثة.`,
      );
    }
    const protector = stats
      .filter((s) => s.total >= 4)
      .sort((a, b) => a.lostRate - b.lostRate)[0];
    if (
      protector &&
      protector.lostRate <= 0.3 &&
      protector.objection !== headline?.objection
    ) {
      insights.push(
        `لما تعالج اعتراض ${protector.objectionLabel} بنجاح، ${Math.round(
          (1 - protector.lostRate) * 100,
        )}% من العملاء بيكملوا الصفقة.`,
      );
    }

    return { generatedAt: now.toISOString(), stats, insights };
  } catch {
    return empty;
  }
}
