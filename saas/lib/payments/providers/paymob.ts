/**
 * Paymob provider (Accept) — hosted iframe checkout.
 *
 * Flow (Paymob "legacy" 3-step order/payment-key API, the most widely available):
 *   1. POST /api/auth/tokens            { api_key }            → auth_token
 *   2. POST /api/ecommerce/orders       { amount_cents, ... }  → order.id
 *   3. POST /api/acceptance/payment_keys{ order_id, ... }      → payment_token
 *   → redirect to /api/acceptance/iframes/{IFRAME_ID}?payment_token=...
 *
 * Webhook: Paymob POSTs a transaction "processed" callback. We verify the HMAC
 * (concatenate a fixed ordered field list, HMAC-SHA512 with PAYMOB_HMAC_SECRET)
 * before trusting `success`.
 *
 * All network calls are isolated here and fail soft: if the provider is not
 * configured or the API errors, createCheckout throws a clear message and the
 * registry surfaces it as a provider error (the customer can fall back to
 * manual transfer).
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

const PAYMOB_HMAC_FIELDS = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success",
];

function get(obj: any, path: string): string {
  const v = path.split(".").reduce((o: any, k) => (o == null ? undefined : o[k]), obj);
  if (v === true) return "true";
  if (v === false) return "false";
  return v == null ? "" : String(v);
}

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    throw new Error(`paymob ${res.status}: ${(json?.message || text || "").toString().slice(0, 200)}`);
  }
  return json;
}

export const paymobProvider: ProviderAdapter = {
  id: "paymob",
  isConfigured() {
    return (
      paymentFlags.paymobEnabled &&
      !!paymentFlags.paymob.apiKey &&
      !!paymentFlags.paymob.integrationId &&
      !!paymentFlags.paymob.iframeId
    );
  },

  async createCheckout(tx: PaymentTxRow, input: CreateCheckoutInput): Promise<CheckoutCreation> {
    const cfg = paymentFlags.paymob;
    if (!this.isConfigured()) throw new Error("paymob_not_configured");
    const base = cfg.baseUrl;
    const amountCents = tx.amountMinor;

    // 1) auth
    const auth = await postJson(`${base}/api/auth/tokens`, { api_key: cfg.apiKey });
    const authToken = auth?.token;
    if (!authToken) throw new Error("paymob_auth_failed");

    // 2) order (use our intentRef as merchant_order_id for idempotent matching)
    const order = await postJson(`${base}/api/ecommerce/orders`, {
      auth_token: authToken,
      delivery_needed: false,
      amount_cents: amountCents,
      currency: tx.currency,
      merchant_order_id: tx.intentRef,
      items: [],
    });
    const orderId = order?.id;
    if (!orderId) throw new Error("paymob_order_failed");

    // 3) payment key
    const nameParts = (input.name || "KEYONE Customer").split(" ");
    const billing = {
      apartment: "NA",
      email: input.email || "customer@keyone.app",
      floor: "NA",
      first_name: nameParts[0] || "KEYONE",
      street: "NA",
      building: "NA",
      phone_number: input.phone || "+20000000000",
      shipping_method: "NA",
      postal_code: "NA",
      city: "NA",
      country: "NA",
      last_name: nameParts.slice(1).join(" ") || "Customer",
      state: "NA",
    };
    const pk = await postJson(`${base}/api/acceptance/payment_keys`, {
      auth_token: authToken,
      amount_cents: amountCents,
      expiration: 3600,
      order_id: orderId,
      billing_data: billing,
      currency: tx.currency,
      integration_id: Number(cfg.integrationId) || cfg.integrationId,
    });
    const paymentToken = pk?.token;
    if (!paymentToken) throw new Error("paymob_payment_key_failed");

    return {
      checkoutUrl: `${base}/api/acceptance/iframes/${cfg.iframeId}?payment_token=${paymentToken}`,
      providerRef: String(orderId),
      providerOrderId: String(orderId),
      raw: { orderId },
    };
  },

  async parseWebhook(raw: string, _headers: Headers, url?: URL): Promise<NormalizedWebhookEvent | null> {
    let body: any = {};
    try {
      body = JSON.parse(raw);
    } catch {
      return null;
    }
    // Paymob nests the transaction under `obj` for processed callbacks.
    const obj = body?.obj || body;
    if (!obj || typeof obj !== "object") return null;

    // HMAC: query param `hmac` (callback) takes precedence, else body.hmac.
    const provided = url?.searchParams.get("hmac") || body?.hmac || "";
    const secret = paymentFlags.paymob.hmacSecret;
    let signatureOk = false;
    if (secret && provided) {
      const concatenated = PAYMOB_HMAC_FIELDS.map((f) => get(obj, f)).join("");
      const expected = crypto.createHmac("sha512", secret).update(concatenated).digest("hex");
      try {
        const a = Buffer.from(expected);
        const b = Buffer.from(String(provided));
        signatureOk = a.length === b.length && crypto.timingSafeEqual(a, b);
      } catch {
        signatureOk = false;
      }
    }

    const success = get(obj, "success") === "true" && get(obj, "error_occured") !== "true";
    return {
      providerRef: get(obj, "order.id"),
      providerOrderId: get(obj, "order.id"),
      success,
      amountMinor: Number(get(obj, "amount_cents")) || undefined,
      currency: get(obj, "currency") || undefined,
      signatureOk,
      raw: obj,
    };
  },
};
