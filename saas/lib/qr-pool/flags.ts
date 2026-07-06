/**
 * lib/qr-pool/flags.ts — flags + tunables for the shared QR slot scheduler.
 *
 * The scheduler books the EXISTING Smart QR Pool (whatsapp-service hibernation)
 * so no QR session stays permanently active. It only ever acts on QrSlotJob rows
 * — which only exist when a tenant uses the credit-broadcast or one-time-import
 * features — so it is a no-op until those features are used.
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

export const qrPoolFlags = {
  /** Master switch for the slot scheduler cron. Default ON (idle = no-op). */
  get schedulerEnabled(): boolean {
    return flag("QR_SCHEDULER_ENABLED", true);
  },
  /** Max QR slots running concurrently (mirror the pool's active budget). */
  get maxConcurrentSlots(): number {
    return num("QR_SCHEDULER_MAX_SLOTS", num("HIBERNATE_MAX_ACTIVE", 4));
  },
  /** A running job older than this (ms) is considered stuck and is reclaimed. */
  get slotTimeoutMs(): number {
    return num("QR_SCHEDULER_SLOT_TIMEOUT_MS", 15 * 60 * 1000);
  },
} as const;
