/**
 * GET /api/wallet — current tenant's wallet summary + Meta usage breakdown.
 * Owner-only (financial): gated by the "billing" permission.
 */
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { getWalletSummary } from "@/lib/wallet/wallet";
import { getTenantMetaBreakdown } from "@/lib/wallet/analytics";
import { walletFlags } from "@/lib/wallet/flags";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const uid = await getUserIdForPermission("billing");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const days = url.searchParams.get("days") === "7" ? 7 : url.searchParams.get("days") === "90" ? 90 : 30;

  try {
    const [wallet, meta] = await Promise.all([
      getWalletSummary(uid),
      getTenantMetaBreakdown(uid, { days }),
    ]);
    return NextResponse.json({
      ok: true,
      wallet: {
        balanceUsd: wallet.balanceUsd,
        currency: wallet.currency,
        status: wallet.status,
        state: wallet.state,
        lowBalanceThresholdUsd: wallet.lowBalanceThresholdUsd,
        totalToppedUpUsd: wallet.totalToppedUpUsd,
        totalSpentUsd: wallet.totalSpentUsd,
      },
      meta,
      billingEnabled: walletFlags.billingEnabled,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "wallet_unavailable", detail: String(e?.message || e) }, { status: 500 });
  }
}
