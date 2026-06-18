/**
 * lib/wallet/money.ts — USD money helpers for the prepaid wallet.
 *
 * Convention: all wallet/meta-cost amounts are USD stored as Float, rounded to
 * 6 decimal places (micro-dollar precision) on every write. Double precision is
 * exact for these magnitudes; this avoids 32-bit Int overflow and BigInt JSON
 * serialization pain. Always round through `roundUsd` before persisting so we
 * never accumulate float drift in the ledger.
 */

/** Micro-dollar precision: round to 6 decimals. Use on EVERY persisted amount. */
export function roundUsd(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1e6) / 1e6;
}

/** Display precision: round to cents (2 decimals). */
export function roundCents(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Clamp to a non-negative amount (wallet balances never go below zero). */
export function nonNegative(n: number): number {
  return n > 0 ? n : 0;
}

/** Parse an arbitrary input into a safe, positive USD magnitude (or 0). */
export function parseUsdAmount(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return roundUsd(n);
}

/** Format a USD amount for display, e.g. 1234.5 → "$1,234.50". */
export function formatUsd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format a fractional USD amount with more precision, e.g. 0.0588 → "$0.0588". */
export function formatUsdPrecise(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const decimals = Math.abs(v) < 1 ? 4 : 2;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: decimals })}`;
}
