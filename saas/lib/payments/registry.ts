/**
 * lib/payments/registry.ts — provider registry + topup orchestration.
 *
 * createTopupCheckout(): records a PaymentTransaction, asks the provider to
 * create the hosted checkout, and (for manual) opens a WalletTopupRequest for
 * admin approval. handleWebhook(): verifies + matches the inbound event and, on
 * success, credits the wallet idempotently via the ledger (key
 * `payment:<provider>:<providerRef>`), so duplicate callbacks never double-credit.
 *
 * The wallet credit is the customer's requested USD amount regardless of the
 * gateway charge currency. All ledger writes go through lib/wallet (atomic).
 */
import { prisma } from "@/lib/db";
import { credit } from "@/lib/wallet/wallet";
import { roundUsd } from "@/lib/wallet/money";
import { paymentFlags } from "./flags";
import { manualProvider } from "./providers/manual";
import { paymobProvider } from "./providers/paymob";
import { stripeProvider } from "./providers/stripe";
import type {
  PaymentProvider,
  ProviderAdapter,
  CreateCheckoutInput,
  CheckoutResult,
  WebhookOutcome,
  PaymentTxRow,
} from "./types";

const ADAPTERS: Record<PaymentProvider, ProviderAdapter> = {
  manual: manualProvider,
  paymob: paymobProvider,
  stripe: stripeProvider,
};

export function getAdapter(provider: string): ProviderAdapter | null {
  return (ADAPTERS as Record<string, ProviderAdapter>)[provider] || null;
}

/** Minor units charged at the gateway = USD × FX × 100, integer. */
function toMinor(amountUsd: number): number {
  return Math.round(amountUsd * paymentFlags.fxUsdToLocal * 100);
}

/**
 * Begin a topup. Creates the PaymentTransaction, calls the provider, and for
 * manual also creates the WalletTopupRequest admin-approval row.
 */
export async function createTopupCheckout(
  provider: PaymentProvider,
  input: CreateCheckoutInput
): Promise<CheckoutResult> {
  const adapter = getAdapter(provider);
  const amountUsd = roundUsd(input.amountUsd);
  const baseFail = (error: string): CheckoutResult => ({
    ok: false,
    provider,
    transactionId: "",
    status: "failed",
    amountUsd,
    error,
  });

  if (!adapter) return baseFail("unknown_provider");
  if (!adapter.isConfigured()) return baseFail("provider_not_configured");
  if (amountUsd <= 0) return baseFail("invalid_amount");

  const currency = paymentFlags.chargeCurrency;
  const amountMinor = toMinor(amountUsd);

  // 1) record the transaction (status=created)
  const tx = await prisma.paymentTransaction.create({
    data: {
      userId: input.userId,
      provider,
      amountUsd,
      amountMinor,
      currency,
      status: "created",
      metadata: JSON.stringify({ email: input.email ?? null, phone: input.phone ?? null }),
    },
  });
  const intentRef = `txn_${tx.id}`;
  await prisma.paymentTransaction.update({ where: { id: tx.id }, data: { intentRef } });

  const txRow: PaymentTxRow = {
    id: tx.id,
    userId: input.userId,
    provider,
    intentRef,
    amountUsd,
    amountMinor,
    currency,
  };

  // 2) manual → open an admin-approval topup request (reuses existing flow)
  let topupRequestId: string | null = null;
  if (provider === "manual") {
    const tr = await prisma.walletTopupRequest
      .create({
        data: {
          userId: input.userId,
          amountUsd,
          method: "manual",
          status: "pending",
          contactPhone: input.phone ? String(input.phone).slice(0, 40) : null,
          note: "topup via payments checkout",
        },
      })
      .catch(() => null);
    topupRequestId = tr?.id || null;
  }

  // 3) ask the provider to create the hosted checkout
  let creation;
  try {
    creation = await adapter.createCheckout(txRow, input);
  } catch (e: any) {
    await prisma.paymentTransaction
      .update({
        where: { id: tx.id },
        data: { status: "failed", failureReason: String(e?.message || e).slice(0, 300) },
      })
      .catch(() => {});
    return baseFail(String(e?.message || e).slice(0, 200));
  }

  const status = provider === "manual" ? "pending" : "pending";
  await prisma.paymentTransaction.update({
    where: { id: tx.id },
    data: {
      status,
      checkoutUrl: creation.checkoutUrl ?? null,
      providerRef: creation.providerRef ?? null,
      providerOrderId: creation.providerOrderId ?? null,
      topupRequestId,
      metadata: JSON.stringify({
        email: input.email ?? null,
        phone: input.phone ?? null,
        raw: creation.raw ?? null,
      }),
    },
  });

  return {
    ok: true,
    provider,
    transactionId: tx.id,
    status: "pending",
    checkoutUrl: creation.checkoutUrl ?? null,
    manualInstructions: creation.manualInstructions ?? null,
    amountUsd,
  };
}

/**
 * Process an inbound provider webhook. Verifies the signature, matches the
 * PaymentTransaction by (provider, providerRef), and on success credits the
 * wallet idempotently. Returns the HTTP status the route should reply with.
 */
export async function handleWebhook(
  provider: PaymentProvider,
  raw: string,
  headers: Headers,
  url?: URL
): Promise<WebhookOutcome> {
  const adapter = getAdapter(provider);
  if (!adapter) return { ok: false, status: 404, handled: false, reason: "unknown_provider" };

  const event = await adapter.parseWebhook(raw, headers, url);
  if (!event) return { ok: false, status: 400, handled: false, reason: "unparseable" };
  if (!event.signatureOk) {
    return { ok: false, status: 401, handled: false, reason: "bad_signature" };
  }

  // Match the transaction (idempotent by provider + providerRef).
  const tx = await prisma.paymentTransaction.findFirst({
    where: { provider, providerRef: event.providerRef },
  });
  if (!tx) {
    // Unknown ref — ack with 200 so the provider stops retrying, but record nothing.
    return { ok: true, status: 200, handled: false, reason: "no_matching_transaction" };
  }

  const rawCapped = raw.slice(0, 8000);

  if (!event.success) {
    await prisma.paymentTransaction
      .update({
        where: { id: tx.id },
        data: { status: "failed", failureReason: "provider_reported_failure", rawEvent: rawCapped },
      })
      .catch(() => {});
    return { ok: true, status: 200, handled: true, transactionId: tx.id, credited: false, reason: "payment_failed" };
  }

  // Success → credit the wallet idempotently.
  const idk = `payment:${provider}:${event.providerRef}`;
  const res = await credit({
    userId: tx.userId,
    kind: "topup",
    amountUsd: tx.amountUsd,
    source: provider,
    reason: `topup:${provider}`,
    idempotencyKey: idk,
    metadata: { provider, providerRef: event.providerRef, transactionId: tx.id },
  });

  await prisma.paymentTransaction
    .update({
      where: { id: tx.id },
      data: {
        status: "paid",
        ledgerId: res.ledgerId,
        reconciledAt: new Date(),
        rawEvent: rawCapped,
      },
    })
    .catch(() => {});

  // Settle the linked manual topup request (if any).
  if (tx.topupRequestId) {
    await prisma.walletTopupRequest
      .update({
        where: { id: tx.topupRequestId },
        data: { status: "approved", ledgerId: res.ledgerId, handledBy: `gateway:${provider}`, handledAt: new Date() },
      })
      .catch(() => {});
  }

  return {
    ok: true,
    status: 200,
    handled: true,
    transactionId: tx.id,
    credited: res.ok && !res.replay,
    reason: res.replay ? "replay" : "credited",
  };
}
