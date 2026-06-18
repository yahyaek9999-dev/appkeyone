/**
 * Monthly broadcast-credit grant cron — grants each active public-plan (k_*)
 * subscriber their tier's monthly credit allotment (idempotent per month).
 *
 * Secured by x-internal-secret. Flag-gated (BROADCAST_MONTHLY_CREDITS_ENABLED),
 * so it is a no-op until the business turns it on. Never sends WhatsApp.
 */
import { NextResponse } from "next/server";
import { checkInternalSecret } from "@/lib/internal-auth";
import { creditFlags } from "@/lib/credits/flags";
import { grantMonthlyCredits } from "@/lib/credits/monthly";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  if (!checkInternalSecret(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!creditFlags.monthlyEnabled) return NextResponse.json({ ok: true, skipped: "monthly_disabled" });

  try {
    const r = await grantMonthlyCredits();
    return NextResponse.json({
      ok: true,
      period: r.period,
      eligible: r.eligible,
      granted: r.granted,
      replayed: r.replayed,
      skipped: r.skipped,
      creditsGranted: r.creditsGranted,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "grant_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }
