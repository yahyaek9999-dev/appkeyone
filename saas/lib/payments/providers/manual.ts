/**
 * Manual transfer provider — bank / InstaPay / Vodafone Cash → admin approval.
 *
 * No external gateway. The checkout simply returns the configured transfer
 * instructions; the customer's WalletTopupRequest (created alongside) is
 * approved by an admin which credits the wallet. No webhook.
 */
import type { ProviderAdapter, PaymentTxRow, CreateCheckoutInput, CheckoutCreation } from "../types";
import { paymentFlags } from "../flags";

export const manualProvider: ProviderAdapter = {
  id: "manual",
  isConfigured() {
    return paymentFlags.manualEnabled;
  },
  async createCheckout(tx: PaymentTxRow, _input: CreateCheckoutInput): Promise<CheckoutCreation> {
    return {
      checkoutUrl: null,
      providerRef: tx.intentRef, // internal ref is enough; reconciled on admin approval
      manualInstructions: paymentFlags.manualInstructions,
      raw: { method: "manual" },
    };
  },
  async parseWebhook() {
    // Manual payments are confirmed by an admin, not a webhook.
    return null;
  },
};
