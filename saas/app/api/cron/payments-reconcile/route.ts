/**
 * Payments reconciliation cron — runs the safety-net sweep on a schedule:
 * re-credits any paid-but-uncredited transaction (idempotent by
 * `payment:<provider>:<ref>`) and expires abandoned gateway intents. Secured by
 * x-internal-secret. Mirrors the structure of app/api/cron/qr-scheduler.
 */
import { NextResponse } from "next/server";
import { checkInternalSecret } from "@/lib/internal-auth";
import { reconcilePayments } from "@/lib/payments";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  if (!checkInternalSecret(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const report = await reconcilePayments({});
    return NextResponse.json({ ok: true, ...report });
  } catch (e: any) {
    return NextResponse.json({ error: "reconcile_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }
