/**
 * GET /api/broadcast-credits — broadcast-credit wallet summary + recent ledger.
 *
 * Credits are a SEPARATE balance from the Meta wallet, consumed by QR-pool
 * broadcast campaigns. This is the owner-facing read endpoint backing the
 * "حملات الرصيد" dashboard. Owner-only via the "broadcasts" permission +
 * capability gate. Read-only.
 */
import { NextResponse } from "next/server";
import { apiGate } from "@/lib/membership/gate";
import { getOrCreateCreditWallet, listCreditLedger } from "@/lib/credits/credits";
import { creditFlags } from "@/lib/credits/flags";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await apiGate("broadcasts", "broadcasts");
  if (g.response) return g.response;
  const uid = g.uid!;

  const url = new URL(req.url);
  const take = Math.min(Math.max(parseInt(url.searchParams.get("take") || "25", 10) || 25, 1), 100);
  const cursor = url.searchParams.get("cursor") || undefined;

  const wallet = await getOrCreateCreditWallet(uid);
  const ledger = await listCreditLedger(uid, { take, cursor });

  return NextResponse.json({
    ok: true,
    wallet: {
      balance: wallet.balance,
      totalPurchased: wallet.totalPurchased,
      totalSpent: wallet.totalSpent,
    },
    perRecipient: creditFlags.perRecipient,
    enforce: creditFlags.enforce,
    ledger: ledger.items,
    nextCursor: ledger.nextCursor,
  });
}
