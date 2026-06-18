/**
 * lib/payments — public surface for the topup payment layer.
 *
 * Bridges the customer's wallet topup intent to a payment gateway (Paymob /
 * Stripe) or the manual transfer + admin-approval flow, then credits the wallet
 * (ledger-first, idempotent) on confirmed payment. Never imported by the
 * protected WhatsApp send pipeline.
 */
export { paymentFlags, enabledProviders } from "./flags";
export { createTopupCheckout, handleWebhook, getAdapter } from "./registry";
export { reconcilePayments, getPaymentStats } from "./reconcile";
export type {
  PaymentProvider,
  PaymentStatus,
  CreateCheckoutInput,
  CheckoutResult,
  WebhookOutcome,
} from "./types";
export type { ReconcileReport, PaymentStats, PaymentProviderStat } from "./reconcile";
