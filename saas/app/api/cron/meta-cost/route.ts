/**
 * Meta Cost Engine cron — reconciles billable Meta conversations from the
 * append-only WaMessage ledger, (optionally) debits wallets, and runs the
 * low-balance alert sweep. Secured by the shared x-internal-secret guard.
 *
 * Accepts GET or POST (cron platforms vary). Optional JSON/query params:
 *   lookbackDays (default 3), userId (limit to one tenant), maxRows.
 *
 * Recording is always-on (safe, append-only). Debiting only happens when
 * WALLET_BILLING_ENABLED=1, so this cron is byte-neutral until billing is
 * switched on. It NEVER calls the WhatsApp send pipeline.
 */
import { NextResponse } from "next/server";
import { checkInternalSecret } from "@/lib/internal-auth";
import { runMetaCostReconciler } from "@/lib/wallet/meta-cost";
import { runLowBalanceSweep } from "@/lib/wallet/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  if (!checkInternalSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  let body: any = {};
  try { if (req.method === "POST") body = await req.json(); } catch {}

  const lookbackDays = Number(body.lookbackDays ?? url.searchParams.get("lookbackDays") ?? 3);
  const userId = body.userId || url.searchParams.get("userId") || undefined;
  const maxRows = body.maxRows ? Number(body.maxRows) : undefined;

  try {
    const reconcile = await runMetaCostReconciler({ lookbackDays, userId, maxRows });
    const lowBalance = await runLowBalanceSweep();
    return NextResponse.json({ ok: true, reconcile, lowBalance });
  } catch (e: any) {
    return NextResponse.json({ error: "reconcile_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }
