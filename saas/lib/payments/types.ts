/**
 * lib/payments/types.ts — shared contracts for the payment-provider layer.
 */

export type PaymentProvider = "manual" | "paymob" | "stripe";

export type PaymentStatus =
  | "created"
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "refunded"
  | "reconciled";

export interface CreateCheckoutInput {
  userId: string;
  amountUsd: number;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  /** Where to redirect the customer after the hosted payment completes. */
  returnUrl?: string | null;
}

/** Row shape we hand to provider adapters (subset of PaymentTransaction). */
export interface PaymentTxRow {
  id: string;
  userId: string;
  provider: PaymentProvider;
  intentRef: string;
  amountUsd: number;
  amountMinor: number;
  currency: string;
}

export interface CheckoutCreation {
  /** Hosted payment page / iframe URL. Null for manual (no redirect). */
  checkoutUrl?: string | null;
  /** External provider intent/order id used to match webhooks. */
  providerRef?: string | null;
  providerOrderId?: string | null;
  /** Instructions for the manual transfer flow. */
  manualInstructions?: string | null;
  raw?: unknown;
}

export interface NormalizedWebhookEvent {
  /** External id used to find the matching PaymentTransaction. */
  providerRef: string;
  providerOrderId?: string | null;
  /** Did the payment succeed? */
  success: boolean;
  amountMinor?: number;
  currency?: string;
  /** Whether the inbound signature verified. */
  signatureOk: boolean;
  raw: unknown;
}

export interface ProviderAdapter {
  id: PaymentProvider;
  /** Provider has the env credentials it needs to operate. */
  isConfigured(): boolean;
  /** Create the external order/session; return checkout url + provider refs. */
  createCheckout(tx: PaymentTxRow, input: CreateCheckoutInput): Promise<CheckoutCreation>;
  /** Verify + parse an inbound webhook into a normalized event (or null). */
  parseWebhook(raw: string, headers: Headers, url?: URL): Promise<NormalizedWebhookEvent | null>;
}

export interface CheckoutResult {
  ok: boolean;
  provider: PaymentProvider;
  transactionId: string;
  status: PaymentStatus;
  checkoutUrl?: string | null;
  manualInstructions?: string | null;
  amountUsd: number;
  error?: string;
}

export interface WebhookOutcome {
  ok: boolean;
  status: number;
  handled: boolean;
  transactionId?: string;
  credited?: boolean;
  reason?: string;
}
