// AI Sales OS — Customer Segmentation (read-only, bounded).
//
// Auto-clusters customers into actionable segments from their stored scores,
// lifecycle signals and REAL order facts (getOrderRollup — the denormalized
// counters are 0). Segments overlap by design (a VIP is also a repeat buyer);
// each customer can belong to several. resolveSegmentCustomers() returns the
// reachable recipient list so the broadcast composer can target a segment.

import { prisma } from "@/lib/db";
import { getOrderRollup, type CustomerOrderStats } from "./order-rollup";

const DAY = 86_400_000;
const MAX_CUSTOMERS = 50_000;
const MAX_RECIPIENTS = 5_000;

export interface SegmentCard {
  key: string;
  label: string;
  description: string;
  count: number;
  revenue: number;
  aov: number;
  lastActivity: string | null; // ISO of most recent member activity
  conversionPct: number; // members with ≥1 order / members
  suggestedAction: string;
}

export const SEGMENT_META: { key: string; label: string; description: string; action: string }[] = [
  { key: "vip", label: "كبار العملاء (VIP)", description: "عملاء مميّزون أو إنفاق مرتفع", action: "كافئهم بعرض حصري أو خدمة أولوية." },
  { key: "repeat_buyers", label: "عملاء متكررون", description: "اشتروا مرتين أو أكثر", action: "اقترح منتجات مكمّلة (Upsell)." },
  { key: "high_intent", label: "محتملون عالي النية", description: "نية شراء عالية بدون طلب بعد", action: "تواصل الآن وأغلق البيع بعرض محدود." },
  { key: "likely_again", label: "مرشّحون للشراء مجددًا", description: "اشتروا وما زالوا متفاعلين", action: "ذكّرهم بمنتج جديد أو إعادة طلب." },
  { key: "abandoned_cart", label: "عربات متروكة", description: "سألوا عن منتج ولم يكملوا", action: "أرسل تذكير سلة + حافز بسيط." },
  { key: "discount_hunters", label: "الباحثون عن الخصومات", description: "حساسون للسعر / كثرة تردد", action: "وجّه لهم كوبون خصم محدود." },
  { key: "at_risk", label: "عملاء في خطر", description: "اشتروا سابقًا وخطر فقدانهم مرتفع", action: "حملة استعادة عاجلة قبل الفقدان." },
  { key: "cold_leads", label: "عملاء باردون", description: "تفاعل ضعيف وبدون نية واضحة", action: "محتوى تعريفي خفيف لإعادة التسخين." },
  { key: "ghost_customers", label: "عملاء صامتون", description: "تواصلوا مرة ثم اختفوا", action: "رسالة إعادة تفعيل ودّية." },
];

type ScoredCustomer = {
  id: string;
  name: string | null;
  phone: string;
  vip: boolean;
  leadScore: number;
  conversionScore: number;
  hesitationScore: number;
  retentionScore: number;
  churnRiskScore: number;
  lastIntent: string | null;
  inboundCount: number;
  lastSeenAt: Date | null;
  cartItems: string;
  cartUpdatedAt: Date | null;
  optedOutAt: Date | null;
  blacklisted: boolean;
  blockedAt: Date | null;
};

function cartCount(json: string): number {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v.length : 0;
  } catch {
    return 0;
  }
}

// Returns the set of segment keys a customer belongs to.
function segmentsFor(c: ScoredCustomer, stats: CustomerOrderStats | undefined, now: number): string[] {
  const orders = stats?.orders || 0;
  const revenue = stats?.revenue || 0;
  const daysSinceSeen = c.lastSeenAt ? (now - new Date(c.lastSeenAt).getTime()) / DAY : Infinity;
  const out: string[] = [];

  if (c.vip || (orders >= 2 && revenue >= 3000)) out.push("vip");
  if (orders >= 2) out.push("repeat_buyers");
  if (orders < 1 && (c.leadScore >= 70 || c.conversionScore >= 60)) out.push("high_intent");
  if (orders >= 1 && c.retentionScore >= 60 && c.churnRiskScore < 40) out.push("likely_again");
  if (orders < 1 && cartCount(c.cartItems) > 0 && c.cartUpdatedAt && now - new Date(c.cartUpdatedAt).getTime() < 30 * DAY)
    out.push("abandoned_cart");
  if (orders < 1 && c.hesitationScore >= 50) out.push("discount_hunters");
  if (orders >= 1 && c.churnRiskScore >= 50) out.push("at_risk");
  if (orders < 1 && c.leadScore < 40 && c.inboundCount >= 1 && c.conversionScore < 60) out.push("cold_leads");
  if (orders < 1 && c.inboundCount >= 1 && c.inboundCount <= 2 && daysSinceSeen > 14) out.push("ghost_customers");

  return out;
}

async function load(userId: string): Promise<{ customers: ScoredCustomer[]; rollup: Awaited<ReturnType<typeof getOrderRollup>> }> {
  const [customers, rollup] = await Promise.all([
    prisma.customer.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        phone: true,
        vip: true,
        leadScore: true,
        conversionScore: true,
        hesitationScore: true,
        retentionScore: true,
        churnRiskScore: true,
        lastIntent: true,
        inboundCount: true,
        lastSeenAt: true,
        cartItems: true,
        cartUpdatedAt: true,
        optedOutAt: true,
        blacklisted: true,
        blockedAt: true,
      },
      take: MAX_CUSTOMERS,
    }) as Promise<ScoredCustomer[]>,
    getOrderRollup(userId),
  ]);
  return { customers, rollup };
}

export interface SegmentsResult {
  generatedAt: string;
  totalCustomers: number;
  segments: SegmentCard[];
}

export async function computeSegments(userId: string): Promise<SegmentsResult> {
  const now = Date.now();
  const { customers, rollup } = await load(userId);

  const agg = new Map<string, { count: number; revenue: number; orders: number; withOrder: number; lastActivity: number }>();
  for (const m of SEGMENT_META) agg.set(m.key, { count: 0, revenue: 0, orders: 0, withOrder: 0, lastActivity: 0 });

  for (const c of customers) {
    const stats = rollup.byCustomer.get(c.id);
    const keys = segmentsFor(c, stats, now);
    const seenAt = c.lastSeenAt ? new Date(c.lastSeenAt).getTime() : 0;
    for (const k of keys) {
      const a = agg.get(k)!;
      a.count++;
      a.revenue += stats?.revenue || 0;
      a.orders += stats?.orders || 0;
      if ((stats?.orders || 0) >= 1) a.withOrder++;
      if (seenAt > a.lastActivity) a.lastActivity = seenAt;
    }
  }

  const segments: SegmentCard[] = SEGMENT_META.map((m) => {
    const a = agg.get(m.key)!;
    return {
      key: m.key,
      label: m.label,
      description: m.description,
      count: a.count,
      revenue: a.revenue,
      aov: a.orders > 0 ? Math.round(a.revenue / a.orders) : 0,
      lastActivity: a.lastActivity > 0 ? new Date(a.lastActivity).toISOString() : null,
      conversionPct: a.count > 0 ? Math.round((a.withOrder / a.count) * 1000) / 10 : 0,
      suggestedAction: m.action,
    };
  });

  return { generatedAt: new Date().toISOString(), totalCustomers: customers.length, segments };
}

function isReachable(ph: string | null | undefined): boolean {
  const v = (ph || "").trim();
  if (!v || v.startsWith("lid:") || v.includes("@lid")) return false;
  const digits = v.replace(/^\+/, "").replace(/[^\d]/g, "");
  return digits.length >= 8 && digits.length <= 13;
}

// Used by the broadcast create path (audience "segment:<key>") and the
// segment "open/filter" view. Excludes opted-out / blacklisted / blocked.
export async function resolveSegmentCustomers(
  userId: string,
  key: string,
  opts: { limit?: number; reachableOnly?: boolean } = {},
): Promise<{ id: string; name: string | null; phone: string }[]> {
  if (!SEGMENT_META.some((m) => m.key === key)) return [];
  const now = Date.now();
  const limit = Math.min(MAX_RECIPIENTS, Math.max(1, opts.limit ?? MAX_RECIPIENTS));
  const reachableOnly = opts.reachableOnly !== false;
  const { customers, rollup } = await load(userId);

  const out: { id: string; name: string | null; phone: string }[] = [];
  for (const c of customers) {
    if (c.optedOutAt || c.blacklisted || c.blockedAt) continue;
    if (reachableOnly && !isReachable(c.phone)) continue;
    const keys = segmentsFor(c, rollup.byCustomer.get(c.id), now);
    if (keys.includes(key)) {
      out.push({ id: c.id, name: c.name, phone: c.phone });
      if (out.length >= limit) break;
    }
  }
  return out;
}
