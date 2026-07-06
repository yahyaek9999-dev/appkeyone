/**
 * lib/wallet/wallet-core.ts — PURE wallet math (no DB, no imports of prisma).
 *
 * Kept import-free so it is trivially unit-testable and so the verify script can
 * exercise the decision logic without a database. The stateful engine in
 * wallet.ts composes these helpers with atomic Prisma writes.
 */

import { roundUsd } from "./money";

export type LedgerDirection = "credit" | "debit";

export interface LedgerLike {
  direction: LedgerDirection | string;
  amountUsd: number;
}

/** Authoritative balance = Σ credits − Σ debits, rounded to micro-dollars. */
export function balanceFromLedger(entries: LedgerLike[]): number {
  let bal = 0;
  for (const e of entries) {
    const amt = roundUsd(Math.abs(Number(e.amountUsd) || 0));
    if (e.direction === "credit") bal += amt;
    else if (e.direction === "debit") bal -= amt;
  }
  return roundUsd(bal);
}

export interface DebitDecision {
  ok: boolean;
  /** The balance that would result if the debit is applied (never negative). */
  balanceAfter: number;
  /** Shortfall when the debit cannot be fully covered (0 when ok). */
  shortfall: number;
}

/**
 * Decide whether `amount` can be debited from `balance`. A prepaid wallet never
 * goes negative: if the balance cannot cover the amount, the debit is rejected
 * and the caller keeps the charge as unbilled debt to retry after a top-up.
 */
export function simulateDebit(balance: number, amount: number): DebitDecision {
  const b = roundUsd(balance);
  const a = roundUsd(Math.abs(amount));
  if (a <= 0) return { ok: true, balanceAfter: b, shortfall: 0 };
  if (b + 1e-9 >= a) return { ok: true, balanceAfter: roundUsd(b - a), shortfall: 0 };
  return { ok: false, balanceAfter: b, shortfall: roundUsd(a - b) };
}

/** Apply a credit, returning the new balance (rounded). */
export function simulateCredit(balance: number, amount: number): number {
  return roundUsd(roundUsd(balance) + roundUsd(Math.abs(amount)));
}

export type BalanceState = "ok" | "low" | "empty";

/** Classify a balance against its low-balance threshold for alerting/UI. */
export function balanceState(balance: number, threshold: number): BalanceState {
  const b = roundUsd(balance);
  if (b <= 0) return "empty";
  if (b <= roundUsd(threshold)) return "low";
  return "ok";
}

/** Deterministic, per-entry reversal key → reversing twice is idempotent. */
export function reversalKey(ledgerId: string): string {
  return `reversal:${ledgerId}`;
}
