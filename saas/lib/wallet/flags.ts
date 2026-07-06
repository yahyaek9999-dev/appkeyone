/**
 * lib/wallet/flags.ts — feature flags for the Wallet + Meta Billing system.
 *
 * Design contract (mirrors lib/scaling-flags.ts):
 *   - All flags default OFF (env var must equal "1") so deploying this code is
 *     byte-neutral to existing flows until an operator opts in.
 *   - The wallet UI, admin credit/debit/adjust, and top-up requests are ALWAYS
 *     available — they are brand-new surfaces that touch only new tables, so
 *     they are safe regardless of these flags.
 *   - `billingEnabled` only controls whether the meta-cost reconciler actually
 *     DEBITS wallets. When OFF the reconciler still RECORDS MetaUsageRecord rows
 *     (shadow / projection), so dashboards show projected spend with zero risk.
 *   - `enforceSends` is intentionally NOT wired into the WhatsApp send pipeline
 *     (CLAUDE.md: never modify it without approval). `walletAllowsSend()` is
 *     provided as a ready helper for a future, approved pipeline change.
 */

function flag(key: string): boolean {
  return process.env[key] === "1";
}

function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

export const walletFlags = {
  /** Meta-cost reconciler DEBITS wallets (vs record-only shadow). Default OFF. */
  get billingEnabled(): boolean {
    return flag("WALLET_BILLING_ENABLED");
  },

  /**
   * GATED OFF + UNWIRED: block outbound sends when the wallet is empty. This is
   * a send-pipeline concern and must not be enabled without explicit approval.
   * `walletAllowsSend()` reads this; the protected pipeline does NOT call it.
   */
  get enforceSends(): boolean {
    return flag("WALLET_ENFORCE_SENDS");
  },

  /** Default low-balance alert threshold (USD) for newly created wallets. */
  get lowBalanceThresholdUsd(): number {
    return num("WALLET_LOW_BALANCE_USD", 5);
  },

  /** Default signup credit (USD) granted to a wallet on first creation. */
  get welcomeCreditUsd(): number {
    return num("WALLET_WELCOME_CREDIT_USD", 0);
  },
} as const;

export type WalletFlags = typeof walletFlags;
