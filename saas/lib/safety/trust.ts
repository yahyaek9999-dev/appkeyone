// Contact Trust System — per-customer trust, engagement, and reply
// frequency scoring. Backed by columns on the Customer table so it
// survives restarts and is reportable in dashboards.
//
// Math is deliberately simple: counters + bounded scores. We never let
// trust shoot up suddenly; it's earned over multiple interactions.
import { prisma } from "@/lib/db";

export interface ContactTrust {
  trustScore: number;
  engagementScore: number;
  customerInitiated: boolean;
  blocked: boolean;
}

/** Compute live trust from the Customer row. Cheap, no DB writes. */
export function computeTrust(c: {
  trustScore: number;
  engagementScore: number;
  inboundCount: number;
  outboundCount: number;
  firstInboundAt: Date | null;
  lastInboundAt: Date | null;
  blockedAt: Date | null;
}): ContactTrust {
  return {
    trustScore: clamp(c.trustScore, 0, 100),
    engagementScore: clamp(c.engagementScore, 0, 100),
    customerInitiated: !!c.firstInboundAt,
    blocked: !!c.blockedAt,
  };
}

/** Called whenever the customer sends us a message. Trust grows slowly. */
export async function onInbound(customerId: string): Promise<void> {
  const c = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!c) return;
  const data: any = {
    inboundCount: { increment: 1 },
    lastInboundAt: new Date(),
  };
  if (!c.firstInboundAt) data.firstInboundAt = new Date();
  // Trust capped at 95; +2 per inbound, slower as we approach the cap.
  const next = Math.min(95, (c.trustScore || 50) + Math.max(1, Math.round(3 - (c.trustScore || 50) / 50)));
  data.trustScore = next;
  // Engagement: long-term EWMA-ish. +5 per inbound capped at 100.
  data.engagementScore = Math.min(100, (c.engagementScore || 0) + 5);
  await prisma.customer.update({ where: { id: customerId }, data });
}

/** Called after a successful outbound. Slightly raises trust if customer-initiated. */
export async function onOutboundSent(customerId: string): Promise<void> {
  const c = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!c) return;
  const data: any = {
    outboundCount: { increment: 1 },
    lastOutboundAt: new Date(),
  };
  // Engagement decays by 1 per outbound (encourages waiting for inbound).
  data.engagementScore = Math.max(0, (c.engagementScore || 0) - 1);
  await prisma.customer.update({ where: { id: customerId }, data });
}

/** Called on send failure / WA error. Lowers trust. */
export async function onOutboundFailed(customerId: string, reason: string): Promise<void> {
  const c = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!c) return;
  const drop = reason.includes("not registered") ? 25
            : reason.includes("blocked") ? 60
            : 8;
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      trustScore: Math.max(0, (c.trustScore || 50) - drop),
      ...(reason.includes("blocked") ? { blockedAt: new Date() } : {}),
    },
  });
}

export async function markCustomerBlocked(customerId: string): Promise<void> {
  await prisma.customer
    .update({
      where: { id: customerId },
      data: { blockedAt: new Date(), trustScore: 0, engagementScore: 0 },
    })
    .catch(() => {});
}

export async function markCustomerReported(customerId: string): Promise<void> {
  await prisma.customer
    .update({
      where: { id: customerId },
      data: { reportedAt: new Date(), trustScore: 0, blockedAt: new Date() },
    })
    .catch(() => {});
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Heuristic: is this contact "trusted enough" for a broadcast/cold msg? */
export function isTrustedForOutbound(t: ContactTrust): boolean {
  if (t.blocked) return false;
  if (!t.customerInitiated) return false;       // never cold-message strangers
  if (t.trustScore < 40) return false;
  if (t.engagementScore < 10) return false;
  return true;
}
