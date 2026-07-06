/**
 * lib/qr-queue/flags.ts — flags + tunables for the QR Queue Platform.
 *
 * The platform lets tenants BOOK a slot on the scarce QR session pool (the same
 * finite concurrent-session budget the Smart QR Pool hibernates). It only acts
 * on QrReservation rows, so it is a no-op until a tenant books. This is QR
 * session scheduling/reservation only — it never sends WhatsApp messages.
 */

function flag(key: string, def = false): boolean {
  const v = process.env[key];
  if (v === undefined) return def;
  return v === "1";
}
function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const qrQueueFlags = {
  /** Master switch for booking + the activation cron. Default ON (idle = no-op). */
  get enabled(): boolean {
    return flag("QR_QUEUE_ENABLED", true);
  },
  /** Concurrent capacity lanes — mirrors the pool's active-session budget. */
  get lanes(): number {
    return Math.max(1, num("QR_QUEUE_LANES", num("QR_SCHEDULER_MAX_SLOTS", num("HIBERNATE_MAX_ACTIVE", 4))));
  },
  /** Default reservation length (minutes) when the caller omits an end time. */
  get defaultDurationMin(): number {
    return Math.max(1, num("QR_QUEUE_DEFAULT_DURATION_MIN", 15));
  },
  /** Longest single reservation a tenant may book (minutes). */
  get maxReservationMin(): number {
    return Math.max(5, num("QR_QUEUE_MAX_RESERVATION_MIN", 120));
  },
  /** Max outstanding (booked/reserved/active) reservations per tenant. */
  get maxActivePerTenant(): number {
    return Math.max(1, num("QR_QUEUE_MAX_ACTIVE_PER_TENANT", 3));
  },
  /** Grace period past windowStart before a non-activated booking is a no-show. */
  get noShowGraceMin(): number {
    return Math.max(1, num("QR_QUEUE_NOSHOW_GRACE_MIN", 10));
  },
  /** How far ahead (days) a tenant may book. */
  get horizonDays(): number {
    return Math.max(1, num("QR_QUEUE_HORIZON_DAYS", 14));
  },
  /** Wake the tenant's WhatsApp session when a reservation activates. */
  get wakeOnActivate(): boolean {
    return flag("QR_QUEUE_WAKE_ON_ACTIVATE", true);
  },
} as const;

export type QrReservationStatus =
  | "booked"
  | "reserved"
  | "active"
  | "completed"
  | "canceled"
  | "expired"
  | "no_show";

export type QrReservationPurpose = "session" | "broadcast" | "import" | "maintenance" | "custom";

/** Statuses that still hold capacity (count against lanes). */
export const HOLDING_STATUSES: QrReservationStatus[] = ["booked", "reserved", "active"];
