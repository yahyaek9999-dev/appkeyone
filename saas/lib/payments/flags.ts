/**
 * lib/payments/flags.ts — payment-gateway configuration (platform-level).
 *
 * KEYONE collects wallet top-ups into the PLATFORM's payment accounts, so these
 * credentials are platform-level and read from env (mirrors lib/wallet/flags.ts:
 * no DB, no validateEnv coupling). Each provider is OFF unless explicitly
 * enabled AND configured. The "manual" method (bank transfer / instapay /
 * vodafone cash → admin approval) is the existing flow and is ON by default.
 *
 * Money model: the wallet credits the customer's requested USD amount. The
 * gateway is charged the local equivalent = round(amountUsd * fxUsdToLocal) in
 * minor units. fxUsdToLocal defaults to 1 (charge in USD). Reconciliation
 * always compares against the credited USD amount.
 */

function flag(key: string): boolean {
  return process.env[key] === "1";
}
function str(key: string): string {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : "";
}
function num(key: string, fallback: number): number {
  const v = parseFloat(process.env[key] || "");
  return Number.isFinite(v) ? v : fallback;
}

export const paymentFlags = {
  /** Manual transfer + admin approval. ON unless explicitly disabled. */
  get manualEnabled(): boolean {
    return process.env.PAYMENTS_MANUAL_ENABLED !== "0";
  },
  /** Paymob (card / wallet / kiosk) hosted checkout. */
  get paymobEnabled(): boolean {
    return flag("PAYMOB_ENABLED");
  },
  /** Stripe Checkout. */
  get stripeEnabled(): boolean {
    return flag("STRIPE_ENABLED");
  },
  /** Currency actually charged at the gateway (the wallet stays USD). */
  get chargeCurrency(): string {
    return (str("PAYMENTS_CHARGE_CURRENCY") || "USD").toUpperCase();
  },
  /** USD → local multiplier applied to the gateway charge (default 1 = USD). */
  get fxUsdToLocal(): number {
    const v = num("PAYMENTS_FX_USD_TO_LOCAL", 1);
    return v > 0 ? v : 1;
  },
  /** Free-text instructions shown for the manual transfer method. */
  get manualInstructions(): string {
    return (
      str("PAYMENTS_MANUAL_INSTRUCTIONS") ||
      "حوّل المبلغ على الحساب البنكي أو InstaPay الموضح ثم أرسل صورة التحويل ورقم العملية. سيتم اعتماد الرصيد بعد المراجعة."
    );
  },
  /** Public base URL for building return/cancel URLs. */
  get appUrl(): string {
    return str("APP_URL") || str("NEXT_PUBLIC_APP_URL") || "";
  },
  paymob: {
    get apiKey(): string {
      return str("PAYMOB_API_KEY");
    },
    get integrationId(): string {
      return str("PAYMOB_INTEGRATION_ID");
    },
    get iframeId(): string {
      return str("PAYMOB_IFRAME_ID");
    },
    get hmacSecret(): string {
      return str("PAYMOB_HMAC_SECRET");
    },
    get baseUrl(): string {
      return str("PAYMOB_BASE_URL") || "https://accept.paymob.com";
    },
  },
  stripe: {
    get secretKey(): string {
      return str("STRIPE_SECRET_KEY");
    },
    get webhookSecret(): string {
      return str("STRIPE_WEBHOOK_SECRET");
    },
  },
} as const;

/** Provider availability for the customer-facing topup UI. */
export function enabledProviders(): { id: "manual" | "paymob" | "stripe"; label: string; configured: boolean }[] {
  const list: { id: "manual" | "paymob" | "stripe"; label: string; configured: boolean }[] = [
    { id: "manual", label: "تحويل يدوي / InstaPay", configured: paymentFlags.manualEnabled },
    {
      id: "paymob",
      label: "بطاقة / محفظة (Paymob)",
      configured:
        paymentFlags.paymobEnabled &&
        !!paymentFlags.paymob.apiKey &&
        !!paymentFlags.paymob.integrationId,
    },
    {
      id: "stripe",
      label: "بطاقة دولية (Stripe)",
      configured: paymentFlags.stripeEnabled && !!paymentFlags.stripe.secretKey,
    },
  ];
  return list.filter((p) => p.configured);
}
