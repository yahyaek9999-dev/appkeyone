/**
 * POST /api/wallet/topup/checkout — begin a wallet topup via a payment provider.
 * Validates the amount, then asks the engine to create the hosted checkout
 * (Paymob / Stripe) or open a manual admin-approval request. Returns the engine
 * CheckoutResult (the client redirects to checkoutUrl when present).
 * Owner-only (financial); gated by the "billing" permission like /api/wallet/topup.
 */
import { NextResponse } from "next/server";
import { getUserForPermission } from "@/lib/auth";
import { createTopupCheckout } from "@/lib/payments";
import { parseUsdAmount } from "@/lib/wallet/money";
import type { PaymentProvider } from "@/lib/payments";

export const dynamic = "force-dynamic";

const PROVIDERS = new Set<PaymentProvider>(["manual", "paymob", "stripe"]);
const MAX_TOPUP_USD = 100_000;

export async function POST(req: Request) {
  const user = await getUserForPermission("billing");
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}

  const amountUsd = parseUsdAmount(body.amountUsd);
  if (amountUsd <= 0) return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  if (amountUsd > MAX_TOPUP_USD) return NextResponse.json({ error: "amount_too_large" }, { status: 400 });

  const provider = String(body.provider || "") as PaymentProvider;
  if (!PROVIDERS.has(provider)) return NextResponse.json({ error: "invalid_provider" }, { status: 400 });

  const email = body.email ? String(body.email).slice(0, 200) : user.email ?? null;
  const phone = body.phone ? String(body.phone).slice(0, 40) : null;

  const result = await createTopupCheckout(provider, {
    userId: user.id,
    amountUsd,
    email,
    phone,
    returnUrl: null,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
