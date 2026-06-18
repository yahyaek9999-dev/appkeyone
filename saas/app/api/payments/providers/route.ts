/**
 * GET /api/payments/providers — list the topup payment providers and whether
 * each is configured (manual / Paymob / Stripe). Owner-only (financial); gated
 * by the "billing" permission to mirror /api/wallet/topup.
 */
import { NextResponse } from "next/server";
import { getUserForPermission } from "@/lib/auth";
import { enabledProviders } from "@/lib/payments";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUserForPermission("billing");
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, providers: enabledProviders() });
}
