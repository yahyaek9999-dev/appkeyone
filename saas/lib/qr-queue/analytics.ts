/**
 * lib/qr-queue/analytics.ts — Queue Analytics + live snapshot.
 *
 * Utilization = booked lane-minutes / available lane-minutes over the window.
 * Also reports status mix, no-show rate, average wait (reserved→active),
 * per-purpose breakdown, and the live capacity snapshot (active now / free now).
 */
import { prisma } from "@/lib/db";
import { qrQueueFlags, HOLDING_STATUSES } from "./flags";
import { checkAvailability } from "./capacity";

export interface QueueSnapshot {
  lanes: number;
  activeNow: number;
  reservedUpcoming: number;
  availableNow: number;
  nextWindowISO: string | null;
}

export async function getQueueSnapshot(): Promise<QueueSnapshot> {
  const now = new Date();
  const lanes = qrQueueFlags.lanes;
  const [activeNow, reservedUpcoming, nextRes, availNow] = await Promise.all([
    prisma.qrReservation.count({ where: { status: "active" } }),
    prisma.qrReservation.count({ where: { status: "reserved", windowStart: { gt: now } } }),
    prisma.qrReservation.findFirst({
      where: { status: "reserved", windowStart: { gt: now } },
      orderBy: { windowStart: "asc" },
      select: { windowStart: true },
    }),
    checkAvailability(now, new Date(now.getTime() + 60_000)),
  ]);
  return {
    lanes,
    activeNow,
    reservedUpcoming,
    availableNow: availNow.available,
    nextWindowISO: nextRes?.windowStart ? nextRes.windowStart.toISOString() : null,
  };
}

export interface QueueAnalytics {
  days: number;
  sinceISO: string;
  lanes: number;
  totals: {
    reservations: number;
    completed: number;
    canceled: number;
    noShow: number;
    expired: number;
    active: number;
    reserved: number;
  };
  noShowRatePct: number;
  avgWaitSec: number;
  bookedLaneMinutes: number;
  availableLaneMinutes: number;
  utilizationPct: number;
  byPurpose: Array<{ purpose: string; count: number; completed: number }>;
  snapshot: QueueSnapshot;
}

export async function getQueueAnalytics(opts: { days?: number } = {}): Promise<QueueAnalytics> {
  const days = opts.days ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60_000);
  const lanes = qrQueueFlags.lanes;

  const rows = await prisma.qrReservation
    .findMany({
      where: { createdAt: { gte: since } },
      select: {
        status: true,
        purpose: true,
        durationMin: true,
        reservedAt: true,
        activatedAt: true,
        windowStart: true,
        windowEnd: true,
      },
      take: 5000,
    })
    .catch(() => []);

  const totals = {
    reservations: rows.length,
    completed: 0,
    canceled: 0,
    noShow: 0,
    expired: 0,
    active: 0,
    reserved: 0,
  };
  let waitSum = 0;
  let waitN = 0;
  let bookedLaneMinutes = 0;
  const purposeMap = new Map<string, { purpose: string; count: number; completed: number }>();

  for (const r of rows) {
    switch (r.status) {
      case "completed":
        totals.completed++;
        break;
      case "canceled":
        totals.canceled++;
        break;
      case "no_show":
        totals.noShow++;
        break;
      case "expired":
        totals.expired++;
        break;
      case "active":
        totals.active++;
        break;
      case "reserved":
      case "booked":
        totals.reserved++;
        break;
    }
    // Booked lane-time counts windows that actually held a lane.
    if (["active", "completed"].includes(r.status)) {
      bookedLaneMinutes += r.durationMin || 0;
    }
    if (r.reservedAt && r.activatedAt) {
      waitSum += (r.activatedAt.getTime() - r.reservedAt.getTime()) / 1000;
      waitN++;
    }
    let p = purposeMap.get(r.purpose);
    if (!p) {
      p = { purpose: r.purpose, count: 0, completed: 0 };
      purposeMap.set(r.purpose, p);
    }
    p.count++;
    if (r.status === "completed") p.completed++;
  }

  const availableLaneMinutes = lanes * days * 24 * 60;
  const fulfilled = totals.completed + totals.active + totals.noShow;
  const noShowRatePct = fulfilled > 0 ? Math.round((totals.noShow / fulfilled) * 1000) / 10 : 0;
  const utilizationPct = availableLaneMinutes > 0 ? Math.round((bookedLaneMinutes / availableLaneMinutes) * 1000) / 10 : 0;

  return {
    days,
    sinceISO: since.toISOString(),
    lanes,
    totals,
    noShowRatePct,
    avgWaitSec: waitN > 0 ? Math.round(waitSum / waitN) : 0,
    bookedLaneMinutes,
    availableLaneMinutes,
    utilizationPct,
    byPurpose: Array.from(purposeMap.values()).sort((a, b) => b.count - a.count),
    snapshot: await getQueueSnapshot(),
  };
}

export { HOLDING_STATUSES };
