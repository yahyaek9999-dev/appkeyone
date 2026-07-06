/**
 * Stripe provider — Checkout Sessions via the REST API (no SDK dependency).
 *
 * createCheckout → POST /v1/checkout/sessions (mode=payment, one line item for
 * the topup amount) → returns the hosted `url`. We pass our intentRef as
 * client_reference_id and metadata so the webhook can match the transaction.
 *
 * Webhook → verify the `Stripe-Signature` header (t=…,v1=… HMAC-SHA256 of
 * "{t}.{payload}" with STRIPE_WEBHOOK_SECRET) before trusting the event. We act
 * on `checkout.session.completed` with payment_status=paid.
 */
import crypto from "crypto";
import type {
  ProviderAdapter,
  PaymentTxRow,
  CreateCheckoutInput,
  CheckoutCreation,
  NormalizedWebhookEvent,
} from "../types";
import { paymentFlags } from "../flags";

function form(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) usp.append(k, String(v));
  }
  return usp.toString();
}

export const stripeProvider: ProviderAdapter = {
  id: "stripe",
  isConfigured() {
    return paymentFlags.stripeEnabled && !!paymentFlags.stripe.secretKey;
  },

  async createCheckout(tx: PaymentTxRow, input: CreateCheckoutInput): Promise<CheckoutCreation> {
    if (!this.isConfigured()) throw new Error("stripe_not_configured");
    const key = paymentFlags.stripe.secretKey;
    const successUrl = (input.returnUrl || `${paymentFlags.appUrl}/dashboard/wallet`) + "?topup=success";
    const cancelUrl = (input.returnUrl || `${paymentFlags.appUrl}/dashboard/wallet`) + "?topup=cancel";

    const payload = form({
      mode: "payment",
      "payment_method_types[0]": "card",
      client_reference_id: tx.intentRef,
      "metadata[transactionId]": tx.id,
      "metadata[userId]": tx.userId,
      "metadata[intentRef]": tx.intentRef,
      success_url: successUrl,
      cancel_url: cancelUrl,
      "line_items[0][quantity]": 1,
      "line_items[0][price_data][currency]": tx.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": tx.amountMinor,
      "line_items[0][price_data][product_data][name]": `KEYONE Wallet Top-up $${tx.amountUsd.toFixed(2)}`,
      ...(input.email ? { customer_email: input.email } : {}),
    });

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: payload,
    });
    const text = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      throw new Error(`stripe ${res.status}: ${(json?.error?.message || text || "").toString().slice(0, 200)}`);
    }
    return {
      checkoutUrl: json?.url || null,
      providerRef: json?.id || null, // checkout session id
      providerOrderId: json?.payment_intent || null,
      raw: { id: json?.id },
    };
  },

  async parseWebhook(raw: string, headers: Headers): Promise<NormalizedWebhookEvent | null> {
    const secret = paymentFlags.stripe.webhookSecret;
    const sigHeader = headers.get("stripe-signature") || "";
    let signatureOk = false;
    if (secret && sigHeader) {
      const parts = Object.fromEntries(
        sigHeader.split(",").map((kv) => {
          const [k, v] = kv.split("=");
          return [k.trim(), (v || "").trim()];
        })
      );
      const t = parts["t"];
      const v1 = parts["v1"];
      if (t && v1) {
        const expected = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
        try {
          const a = Buffer.from(expected);
          const b = Buffer.from(v1);
          signatureOk = a.length === b.length && crypto.timingSafeEqual(a, b);
        } catch {
          signatureOk = false;
        }
      }
    }

    let event: any = {};
    try {
      event = JSON.parse(raw);
    } catch {
      return null;
    }
    const type = event?.type || "";
    const session = event?.data?.object || {};
    // We credit on a completed, paid checkout session.
    const success = type === "checkout.session.completed" && session?.payment_status === "paid";
    const providerRef = session?.id || event?.id || "";
    if (!providerRef) return null;

    return {
      providerRef: String(providerRef),
      providerOrderId: session?.payment_intent ? String(session.payment_intent) : null,
      success,
      amountMinor: Number(session?.amount_total) || undefined,
      currency: session?.currency ? String(session.currency).toUpperCase() : undefined,
      signatureOk,
      raw: { type, sessionId: session?.id },
    };
  },
};
