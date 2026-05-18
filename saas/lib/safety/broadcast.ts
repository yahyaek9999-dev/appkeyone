// Broadcast Safety Layer — pre-flight + per-item checks for outbound
// broadcasts. Filters audience down to "trusted, customer-initiated"
// contacts, micro-batches the survivors, and randomizes order to avoid
// predictable patterns.
//
// Used by:
//   * /api/broadcasts (POST)        — pre-flight filter & paraphrase
//   * /api/broadcasts/dispatch      — per-tick batch picker
import { prisma } from "@/lib/db";
import { loadState } from "./store";
import { getStageLimits } from "./warmup";
import { isTrustedForOutbound, computeTrust } from "./trust";

export interface AudienceCustomer {
  id: string;
  phone: string;
  name: string | null;
  trustScore: number;
  engagementScore: number;
  inboundCount: number;
  outboundCount: number;
  firstInboundAt: Date | null;
  lastInboundAt: Date | null;
  blockedAt: Date | null;
}

export interface PreflightResult {
  eligible: AudienceCustomer[];
  skippedLid: number;
  skippedColdContact: number;
  skippedBlocked: number;
  skippedLowTrust: number;
  totalRequested: number;
  warmupCap: number;
  willBeSentToday: number;
  willBeQueued: number;
}

/** Apply Reply-First strategy + warmup caps to a candidate audience. */
export async function preflight(
  userId: string,
  candidates: AudienceCustomer[]
): Promise<PreflightResult> {
  const state = await loadState(userId);
  const limits = getStageLimits(state.warmupStage);

  let skippedLid = 0;
  let skippedColdContact = 0;
  let skippedBlocked = 0;
  let skippedLowTrust = 0;

  const eligible: AudienceCustomer[] = [];

  for (const c of candidates) {
    if (c.phone.startsWith("lid:") || c.phone.includes("@lid")) {
      skippedLid++;
      continue;
    }
    if (c.blockedAt) {
      skippedBlocked++;
      continue;
    }
    const trust = computeTrust(c);
    if (!trust.customerInitiated) {
      skippedColdContact++;
      continue;
    }
    if (!isTrustedForOutbound(trust)) {
      skippedLowTrust++;
      continue;
    }
    eligible.push(c);
  }

  // Prioritize engaged customers: sort by (engagement + trust) DESC, then
  // shuffle WITHIN tiers only so order stays unpredictable but the best
  // recipients always go first. This protects deliverability while still
  // preventing a perfectly sorted, fingerprintable broadcast pattern.
  eligible.sort((a, b) => {
    const sa = (a.engagementScore || 0) + (a.trustScore || 0);
    const sb = (b.engagementScore || 0) + (b.trustScore || 0);
    return sb - sa;
  });
  // Tier-bound shuffle (jitter within 5-element groups). Keeps top-of-list
  // priority while avoiding a deterministic global order.
  const TIER = 5;
  for (let start = 0; start < eligible.length; start += TIER) {
    const end = Math.min(start + TIER, eligible.length);
    for (let i = end - 1; i > start; i--) {
      const j = start + Math.floor(Math.random() * (i - start + 1));
      [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }
  }

  // Apply daily cap minus what we've already sent today.
  const remainingToday = Math.max(0, limits.maxDaily - state.dailySends);
  const willBeSentToday = Math.min(eligible.length, Math.max(0, remainingToday - 5)); // reserve 5 for chat replies
  const willBeQueued = Math.max(0, eligible.length - willBeSentToday);

  return {
    eligible,
    skippedLid,
    skippedColdContact,
    skippedBlocked,
    skippedLowTrust,
    totalRequested: candidates.length,
    warmupCap: limits.maxDaily,
    willBeSentToday,
    willBeQueued,
  };
}

/** Paraphrase template per recipient. Pure deterministic shuffles —
 * the LLM is NOT called here (cheap, predictable, broadcast-safe). */
export function paraphraseTemplate(template: string, idx: number): string {
  // Simple variations: choose between 4 greeting prefixes, optionally
  // shift trailing exclamation, vary spacing. The point is to AVOID 100
  // identical messages going out at exactly the same time — not to
  // creatively rewrite the merchant's message.
  const greetings = ["", "أهلاً ", "مرحباً ", "هاي "];
  const closings  = ["", " 🌹", " ✨", ""];
  const g = greetings[idx % greetings.length];
  const c = closings[(idx * 7) % closings.length];
  let body = template.replace(/\s+/g, " ").trim();
  // Drop trailing punctuation 50% of the time
  if (idx % 2 === 0) body = body.replace(/[.!]+$/, "");
  return `${g}${body}${c}`;
}

export async function fetchAudience(
  userId: string,
  audience: string
): Promise<AudienceCustomer[]> {
  const where: any = { userId };
  if (audience === "hot") where.leadScore = { gte: 70 };
  else if (audience === "warm") where.leadScore = { gte: 40, lt: 70 };
  else if (audience.startsWith("tag:")) {
    const tag = audience.slice(4);
    where.tags = { contains: `"${tag}"` };
  }
  const rows = await prisma.customer.findMany({
    where,
    select: {
      id: true, phone: true, name: true,
      trustScore: true, engagementScore: true,
      inboundCount: true, outboundCount: true,
      firstInboundAt: true, lastInboundAt: true,
      blockedAt: true,
    } as any,
  });
  return rows as any;
}
