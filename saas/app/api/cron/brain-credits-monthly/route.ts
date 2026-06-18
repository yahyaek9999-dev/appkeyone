/**
 * Monthly Brain-credit grant cron (Phase 7). Internal-secret gated, fail-closed,
 * flag-gated (BRAIN_MONTHLY_CREDITS_ENABLED). Idempotent per (user, month).
 */
import { NextResponse } from "next/server";
import { checkInternalSecret } from "@/lib/internal-auth";
import { brainFlags } from "@/lib/brain/flags";
import { grantMonthlyBrainCredits } from "@/lib/brain/monthly";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  if (!checkInternalSecret(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!brainFlags.monthlyEnabled) return NextResponse.json({ ok: true, skipped: "brain_monthly_disabled" });
  try {
    const r = await grantMonthlyBrainCredits();
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ error: "grant_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }
