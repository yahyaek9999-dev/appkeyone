/**
 * lib/qr-queue/capacity.ts — QR Capacity Manager.
 *
 * The scarce resource is `lanes` concurrent QR session slots. A reservation
 * occupies one lane for its [windowStart, windowEnd) interval. We grant a new
 * booking only if, at every instant of the requested window, the number of
 * already-holding reservations plus the new one stays within `lanes`.
 *
 * Concurrency is computed with a sweep-line peak (exact, not a conservative
 * overlap count), so back-to-back bookings on the same lane don't block each
 * other. Lane packing assigns the lowest free lane for clean utilization.
 */
import { prisma } from "@/lib/db";
import { qrQueueFlags, HOLDING_STATUSES } from "./flags";

interface Interval {
  start: number;
  end: number;
  lane: number | null;
}

/** Max simultaneous intervals overlapping [winStart, winEnd). Ends before starts. */
export function peakOverlap(items: Interval[], winStart: number, winEnd: number): number {
  const pts: Array<[number, number]> = [];
  for (const it of items) {
    const s = Math.max(it.start, winStart);
    const e = Math.min(it.end, winEnd);
    if (e <= s) continue;
    pts.push([s, 1]);
    pts.push([e, -1]);
  }
  // Same instant: process -1 (end) before +1 (start) so adjacent slots don't clash.
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0;
  let peak = 0;
  for (const [, d] of pts) {
    cur += d;
    if (cur > peak) peak = cur;
  }
  return peak;
}

async function holdingIntervals(winStart: Date, winEnd: Date, excludeId?: string): Promise<Interval[]> {
  // Pull reservations whose window could overlap, in a holding status.
  const rows = await prisma.qrReservation.findMany({
    where: {
      status: { in: HOLDING_STATUSES as string[] },
      windowStart: { lt: winEnd },
      windowEnd: { gt: winStart },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, windowStart: true, windowEnd: true, lane: true },
    take: 1000,
  });
  return rows.map((r) => ({ start: r.windowStart.getTime(), end: r.windowEnd.getTime(), lane: r.lane }));
}

export interface AvailabilityResult {
  lanes: number;
  peak: number;
  available: number;
  canBook: boolean;
}

/** Capacity check for a requested window. available = lanes - peak holding. */
export async function checkAvailability(
  windowStart: Date,
  windowEnd: Date,
  excludeId?: string
): Promise<AvailabilityResult> {
  const lanes = qrQueueFlags.lanes;
  const items = await holdingIntervals(windowStart, windowEnd, excludeId);
  const peak = peakOverlap(items, windowStart.getTime(), windowEnd.getTime());
  const available = Math.max(0, lanes - peak);
  return { lanes, peak, available, canBook: available >= 1 };
}

/** Lowest lane index [0..lanes-1] free for the whole window, or -1 if none. */
export async function lowestFreeLane(
  windowStart: Date,
  windowEnd: Date,
  excludeId?: string
): Promise<number> {
  const lanes = qrQueueFlags.lanes;
  const items = await holdingIntervals(windowStart, windowEnd, excludeId);
  for (let lane = 0; lane < lanes; lane++) {
    const laneItems = items.filter((i) => i.lane === lane);
    if (peakOverlap(laneItems, windowStart.getTime(), windowEnd.getTime()) === 0) return lane;
  }
  return -1;
}

/**
 * Suggest the next start time (from `from`) where a `durationMin` booking fits.
 * Scans in `stepMin` increments up to the booking horizon. Returns null if the
 * horizon is full.
 */
export interface DaySlot {
  startISO: string;
  endISO: string;
  hour: number;
  available: number;
  capacity: number;
  state: "past" | "available" | "busy" | "full";
}

/**
 * Per-slot availability for a whole calendar day (one query, peak per slot).
 * Powers the booking calendar: each hour-long slot is available / busy / full /
 * past with its remaining capacity. No manual date entry needed.
 */
export async function dayAvailability(dayLocal: Date, slotMin = 60): Promise<{ lanes: number; slots: DaySlot[] }> {
  const lanes = qrQueueFlags.lanes;
  const dayStart = new Date(dayLocal);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);

  const rows = await prisma.qrReservation.findMany({
    where: {
      status: { in: HOLDING_STATUSES as string[] },
      windowStart: { lt: dayEnd },
      windowEnd: { gt: dayStart },
    },
    select: { windowStart: true, windowEnd: true, lane: true },
    take: 2000,
  });
  const items: Interval[] = rows.map((r) => ({ start: r.windowStart.getTime(), end: r.windowEnd.getTime(), lane: r.lane }));

  const now = Date.now();
  const slotMs = slotMin * 60_000;
  const slots: DaySlot[] = [];
  for (let t = dayStart.getTime(); t < dayEnd.getTime(); t += slotMs) {
    const s = t;
    const e = t + slotMs;
    const peak = peakOverlap(items, s, e);
    const available = Math.max(0, lanes - peak);
    let state: DaySlot["state"];
    if (e <= now) state = "past";
    else if (available <= 0) state = "full";
    else if (peak > 0) state = "busy";
    else state = "available";
    slots.push({ startISO: new Date(s).toISOString(), endISO: new Date(e).toISOString(), hour: new Date(s).getHours(), available, capacity: lanes, state });
  }
  return { lanes, slots };
}

export async function suggestNextSlot(
  from: Date,
  durationMin: number,
  stepMin = 15
): Promise<Date | null> {
  const horizonMs = qrQueueFlags.horizonDays * 24 * 60 * 60_000;
  const limit = from.getTime() + horizonMs;
  const durMs = durationMin * 60_000;
  let cursor = Math.ceil(from.getTime() / (stepMin * 60_000)) * (stepMin * 60_000);
  let guard = 0;
  while (cursor + durMs <= limit && guard < 2000) {
    const s = new Date(cursor);
    const e = new Date(cursor + durMs);
    const a = await checkAvailability(s, e);
    if (a.canBook) return s;
    cursor += stepMin * 60_000;
    guard++;
  }
  return null;
}
