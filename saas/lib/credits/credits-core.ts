/**
 * lib/credits/credits-core.ts — PURE broadcast-credit math (no DB).
 * Integer credits; same invariants as the wallet (never negative, idempotent).
 */

export interface CreditEntryLike { direction: string; amount: number }

export function balanceFromLedger(entries: CreditEntryLike[]): number {
  let b = 0;
  for (const e of entries) {
    const a = Math.max(0, Math.round(Number(e.amount) || 0));
    if (e.direction === "credit") b += a;
    else if (e.direction === "debit") b -= a;
  }
  return b;
}

export interface CreditDebitDecision { ok: boolean; balanceAfter: number; shortfall: number }

export function simulateDebit(balance: number, amount: number): CreditDebitDecision {
  const b = Math.round(balance);
  const a = Math.max(0, Math.round(amount));
  if (a <= 0) return { ok: true, balanceAfter: b, shortfall: 0 };
  if (b >= a) return { ok: true, balanceAfter: b - a, shortfall: 0 };
  return { ok: false, balanceAfter: b, shortfall: a - b };
}

export function reversalKey(ledgerId: string): string {
  return `reversal:${ledgerId}`;
}

/** Credits required for a campaign of N recipients at a per-recipient rate. */
export function creditsForRecipients(recipients: number, perRecipient: number): number {
  return Math.max(0, Math.round(recipients)) * Math.max(1, Math.round(perRecipient));
}
