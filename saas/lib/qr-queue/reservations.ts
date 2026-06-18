/**
 * lib/qr-queue/reservations.ts — QR Session Booking + Reservation + Lifecycle.
 *
 * Lifecycle: reserved → active → completed
 *                     ↘ canceled / expired / no_show
 *
 * book(): validates the window, enforces per-tenant limits, checks capacity via
 * the Capacity Manager, packs a lane, and creates a reserved QrReservation.
 * The activation cron (drive()) flips due reservations to active (optionally
 * waking the tenant's session), completes finished ones, and marks no-shows /
 * expirations. It never sends WhatsApp messages.
 */
import { prisma } from "@/lib/db";
import { wa } from "@/lib/wa";
import { qrQueueFlags, type QrReservationPurpose } from "./flags";
import { checkAvailability, lowestFreeLane, suggestNextSlot } from "./capacity";

const PURPOSES: QrReservationPurpose[] = ["session", "broadcast", "import", "maintenance", "custom"];

export interface BookInput {
  userId: string;
  purpose?: string;
  windowStart: Date;
  windowEnd?: Date | null;
  durationMin?: number;
  priority?: number;
  note?: string | null;
  metadata?: Record<string, unknown>;
}

export interface BookResult {
  ok: boolean;
  reservation?: any;
  reason?: string;
  suggestionISO?: string | null;
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v || {});
  } catch {
    return "{}";
  }
}

/** Book a QR session slot. Returns the reservation or a reason it was refused. */
export async function bookReservation(input: BookInput): Promise<BookResult> {
  if (!qrQueueFlags.enabled) return { ok: false, reason: "queue_disabled" };

  const purpose = PURPOSES.includes(input.purpose as QrReservationPurpose)
    ? (input.purpose as QrReservationPurpose)
    : "session";

  const now = Date.now();
  const start = input.windowStart;
  if (!(start instanceof Date) || isNaN(start.getTime())) return { ok: false, reason: "invalid_start" };

  // Duration / end.
  let durationMin = input.durationMin && input.durationMin > 0 ? Math.floor(input.durationMin) : qrQueueFlags.defaultDurationMin;
  durationMin = Math.min(durationMin, qrQueueFlags.maxReservationMin);
  const end = input.windowEnd instanceof Date && !isNaN(input.windowEnd.getTime())
    ? input.windowEnd
    : new Date(start.getTime() + durationMin * 60_000);

  if (end.getTime() <= start.getTime()) return { ok: false, reason: "invalid_window" };
  if ((end.getTime() - start.getTime()) / 60_000 > qrQueueFlags.maxReservationMin) return { ok: false, reason: "too_long" };

  // Window must end in the future and start within the horizon.
  if (end.getTime() <= now) return { ok: false, reason: "in_the_past" };
  const horizonMs = qrQueueFlags.horizonDays * 24 * 60 * 60_000;
  if (start.getTime() > now + horizonMs) return { ok: false, reason: "beyond_horizon" };

  // Per-tenant outstanding cap.
  const outstanding = await prisma.qrReservation.count({
    where: { userId: input.userId, status: { in: ["booked", "reserved", "active"] } },
  });
  if (outstanding >= qrQueueFlags.maxActivePerTenant) {
    return { ok: false, reason: "tenant_limit_reached" };
  }

  // Capacity + lane assignment.
  const avail = await checkAvailability(start, end);
  if (!avail.canBook) {
    const suggestion = await suggestNextSlot(new Date(Math.max(now, start.getTime())), durationMin);
    return { ok: false, reason: "no_capacity", suggestionISO: suggestion ? suggestion.toISOString() : null };
  }
  const lane = await lowestFreeLane(start, end);
  if (lane < 0) {
    const suggestion = await suggestNextSlot(new Date(Math.max(now, start.getTime())), durationMin);
    return { ok: false, reason: "no_capacity", suggestionISO: suggestion ? suggestion.toISOString() : null };
  }

  const reservation = await prisma.qrReservation.create({
    data: {
      userId: input.userId,
      purpose,
      status: "reserved",
      priority: input.priority || 0,
      windowStart: start,
      windowEnd: end,
      durationMin,
      lane,
      reservedAt: new Date(),
      expiresAt: new Date(end.getTime() + qrQueueFlags.noShowGraceMin * 60_000),
      note: input.note ? String(input.note).slice(0, 500) : null,
      metadata: safeJson(input.metadata),
    },
  });

  return { ok: true, reservation };
}

/** Cancel a reservation (tenant- or admin-initiated). */
export async function cancelReservation(id: string, userId?: string) {
  const where: any = { id };
  if (userId) where.userId = userId;
  const r = await prisma.qrReservation.findFirst({ where });
  if (!r) return null;
  if (["completed", "canceled", "expired", "no_show"].includes(r.status)) return r;
  return prisma.qrReservation.update({
    where: { id: r.id },
    data: { status: "canceled", canceledAt: new Date() },
  });
}

/** Mark a reservation completed (its session window finished cleanly). */
export async function completeReservation(id: string, result?: Record<string, unknown>) {
  return prisma.qrReservation.update({
    where: { id },
    data: { status: "completed", completedAt: new Date(), result: safeJson(result) },
  });
}

export interface DriveReport {
  activated: number;
  completed: number;
  noShow: number;
  expired: number;
  errors: number;
}

/**
 * Activation cron tick (QR Slot Scheduler for reservations). Idempotent:
 *   - due reserved windows → active (best-effort wake the session)
 *   - active windows past end → completed
 *   - reserved windows past start+grace, never activated → no_show
 *   - anything past expiresAt still holding → expired
 */
export async function drive(): Promise<DriveReport> {
  const report: DriveReport = { activated: 0, completed: 0, noShow: 0, expired: 0, errors: 0 };
  if (!qrQueueFlags.enabled) return report;
  const now = new Date();
  const graceMs = qrQueueFlags.noShowGraceMin * 60_000;

  // 1) Activate due reserved windows (respecting current lane capacity).
  const due = await prisma.qrReservation.findMany({
    where: { status: "reserved", windowStart: { lte: now }, windowEnd: { gt: now } },
    orderBy: [{ priority: "desc" }, { windowStart: "asc" }],
    take: 50,
  });
  for (const r of due) {
    try {
      const claim = await prisma.qrReservation.updateMany({
        where: { id: r.id, status: "reserved" },
        data: { status: "active", activatedAt: now },
      });
      if (claim.count === 1) {
        report.activated++;
        if (qrQueueFlags.wakeOnActivate && r.purpose !== "custom") {
          // Provision a live session for the booked window. Best-effort; a wake
          // failure never fails the reservation (the tenant can retry the wake).
          await wa.wake(r.userId).catch(() => {});
        }
      }
    } catch {
      report.errors++;
    }
  }

  // 2) Complete active windows that have ended.
  const ended = await prisma.qrReservation.findMany({
    where: { status: "active", windowEnd: { lte: now } },
    take: 100,
  });
  for (const r of ended) {
    try {
      await prisma.qrReservation.update({
        where: { id: r.id },
        data: { status: "completed", completedAt: now },
      });
      report.completed++;
    } catch {
      report.errors++;
    }
  }

  // 3) No-shows: reserved, never activated, past start + grace.
  const noShowCutoff = new Date(now.getTime() - graceMs);
  const noShow = await prisma.qrReservation.updateMany({
    where: { status: "reserved", windowStart: { lt: noShowCutoff } },
    data: { status: "no_show" },
  });
  report.noShow = noShow.count;

  // 4) Expire anything still holding past its expiresAt.
  const expired = await prisma.qrReservation.updateMany({
    where: { status: { in: ["reserved", "booked"] }, expiresAt: { lt: now } },
    data: { status: "expired" },
  });
  report.expired += expired.count;

  return report;
}

export async function myReservations(userId: string, take = 50) {
  return prisma.qrReservation.findMany({
    where: { userId },
    orderBy: [{ windowStart: "desc" }],
    take: Math.min(take, 200),
  });
}

export async function reservationById(id: string, userId?: string) {
  const where: any = { id };
  if (userId) where.userId = userId;
  return prisma.qrReservation.findFirst({ where });
}

/** 1-based position among upcoming reserved windows (by start time); 0 if not reserved. */
export async function queuePositionFor(id: string): Promise<number> {
  const r = await prisma.qrReservation.findUnique({ where: { id } });
  if (!r || r.status !== "reserved") return 0;
  const ahead = await prisma.qrReservation.count({
    where: {
      status: "reserved",
      OR: [
        { windowStart: { lt: r.windowStart } },
        { windowStart: r.windowStart, priority: { gt: r.priority } },
      ],
    },
  });
  return ahead + 1;
}
