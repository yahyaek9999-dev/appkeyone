// Smart Campaigns — audience builder.
//
// Translates an audience selector into a Prisma `where` on the EXISTING
// Customer columns. Pure function, no DB calls, no schema changes. Used by the
// broadcast create API. Existing values (all/hot/warm/tag:) keep their exact
// previous behavior; the new segments are additive.

const DAY = 24 * 60 * 60 * 1000;

export interface AudienceOpts {
  inactiveDays?: number; // for "inactive" — default 30
  from?: string | Date | null; // for "date_range" (createdAt >=)
  to?: string | Date | null; // for "date_range" (createdAt <=)
  now?: Date;
}

/**
 * Build the Customer `where` for a broadcast audience. Always scoped to userId.
 *
 * Supported audiences:
 *   all          → everyone
 *   hot          → leadScore >= 70           (existing)
 *   warm         → leadScore 40..69          (existing)
 *   buyers       → orderCount > 0
 *   no_purchase  → orderCount = 0
 *   inactive     → lastSeenAt < now - inactiveDays
 *   abandoned    → hesitationScore >= 40     (Wave-8 cart-abandonment signal)
 *   date_range   → createdAt between from..to
 *   tag:<tag>    → tags JSON contains <tag>  (existing)
 */
export function buildAudienceWhere(
  userId: string,
  audience: string,
  opts: AudienceOpts = {},
): Record<string, any> {
  const where: Record<string, any> = { userId };
  const now = opts.now ?? new Date();

  if (audience === "hot") {
    where.leadScore = { gte: 70 };
  } else if (audience === "warm") {
    where.leadScore = { gte: 40, lt: 70 };
  } else if (audience === "buyers") {
    where.orderCount = { gt: 0 };
  } else if (audience === "no_purchase") {
    where.orderCount = { lte: 0 };
  } else if (audience === "inactive") {
    const days = Number.isFinite(opts.inactiveDays) ? Number(opts.inactiveDays) : 30;
    where.lastSeenAt = { lt: new Date(now.getTime() - days * DAY) };
  } else if (audience === "abandoned") {
    where.hesitationScore = { gte: 40 };
  } else if (audience === "date_range") {
    const range: Record<string, Date> = {};
    if (opts.from) range.gte = new Date(opts.from);
    if (opts.to) range.lte = new Date(opts.to);
    if (range.gte || range.lte) where.createdAt = range;
  } else if (audience.startsWith("tag:")) {
    const tag = audience.slice(4);
    if (tag) where.tags = { contains: JSON.stringify(tag).slice(1, -1) };
  }
  // "all" (and unknown values) → no extra filter, just userId.

  return where;
}

/** Human-readable Arabic label for a given audience value (for UI/reporting). */
export function audienceLabel(audience: string): string {
  if (audience.startsWith("tag:")) return `وسم: ${audience.slice(4)}`;
  const map: Record<string, string> = {
    all: "كل العملاء",
    hot: "عملاء مهتمون (Hot)",
    warm: "عملاء فاترون (Warm)",
    buyers: "عملاء اشتروا من قبل",
    no_purchase: "عملاء بدون شراء",
    inactive: "عملاء غير نشطين",
    abandoned: "عربات متروكة",
    date_range: "حسب تاريخ التسجيل",
  };
  return map[audience] || audience;
}
