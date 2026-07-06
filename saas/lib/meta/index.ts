/**
 * Meta Enterprise Platform — engine barrel.
 *
 * Phase 1 (tenant/lifecycle/health), Phase 2 (billing/usage/invoicing),
 * Phase 3 (limits). Additive: reuses Bot (credentials), WaWebhookEvent
 * (webhooks), Wallet/WalletLedger (balance), and WaMessage (message ledger).
 */

export * from "./pricing";
export * from "./limits";
export * from "./tenant";
export * from "./billing";
export * from "./admin-ops";
export * from "./incidents";
export * from "./health";
export * from "./analytics";
export * from "./providers";
export * from "./worker";
export * from "./connection-test";

import { ensureDefaultRates } from "./pricing";
import { ensureDefaultLimits } from "./limits";

/** Idempotently seed default pricing + global limits. Safe to call on boot or
 *  from an admin "initialize" action — never clobbers admin-tuned values. */
export async function ensureMetaDefaults(): Promise<{ rates: number; limits: number }> {
  const rates = await ensureDefaultRates();
  const limits = await ensureDefaultLimits();
  return { rates, limits };
}
